/**
 * V7 T144 — meeting review → approval-gated suggestions (pure core).
 *
 * The agent reads the newest meeting, compares stated facts against Atlas
 * data, and files suggestions into the EXISTING atlas.suggestions queue —
 * one per proposed change, with a STRUCTURED proposed_patch:
 *   { entity, id, field, current_value, proposed_value,
 *     evidence: { quote, timestamp? }, large_change }
 *
 * This module is the pure seam: prompt building + response parsing +
 * validation. Guardrails live HERE so they're unit-testable without a model:
 *   - allow-listed entities/fields only; unknown → rejected with a note,
 *     never a crash (Rule 7)
 *   - evidence quote REQUIRED (no quote → rejected)
 *   - max 10 accepted suggestions per run (doc guardrail)
 *   - numeric deltas > 25% flagged large_change (panel renders the flag)
 *   - no-op proposals (proposed == current) are dropped
 *   - the id must exist in the Atlas snapshot the model was shown
 *
 * NOTHING here writes — the route files suggestions as PENDING; a human
 * approves before any apply (Rule 7: suggestions never auto-applied).
 */

export type ReviewEntity = 'project' | 'opportunity' | 'capital_source';

/** Fields the apply path can route to the SAME repo/service fns the UI uses. */
export const ALLOWED_FIELDS: Record<ReviewEntity, readonly string[]> = {
  project: [
    'sale_price_override_usd',
    'land_cost_usd',
    'build_cost_per_sqft',
    'soft_costs_lump_sum',
    'villa_sqft_ag',
    'villa_sqft_bg',
    'construction_months',
    'sales_months',
    'tax_rate_pct',
    'target_margin',
  ],
  opportunity: [
    'cash_needed_usd',
    'timeline_months',
    'expected_profit_usd',
    'expected_margin_pct',
    'next_step',
    'next_step_owner',
    'notes',
  ],
  capital_source: ['limit_usd', 'interest_rate_pct'],
};

export const MAX_SUGGESTIONS_PER_RUN = 10;
const LARGE_CHANGE_THRESHOLD = 0.25;

export interface ReviewEvidence {
  quote: string;
  timestamp?: string;
}

export interface ProposedPatch {
  entity: ReviewEntity;
  /** project_key for projects; uuid for opportunities/capital sources. */
  id: string;
  field: string;
  current_value: unknown;
  proposed_value: unknown;
  evidence: ReviewEvidence;
  /** Numeric change > 25% — the review panel renders a "large change" flag. */
  large_change: boolean;
  /** Provenance for the panel. */
  meeting_id: string;
  meeting_title: string;
}

export interface AtlasFactSnapshot {
  projects: Array<{
    project_key: string;
    name: string;
    fields: Record<string, unknown>;
  }>;
  opportunities: Array<{ id: string; name: string; fields: Record<string, unknown> }>;
  capital_sources: Array<{ id: string; name: string; fields: Record<string, unknown> }>;
}

export interface ParsedReview {
  accepted: ProposedPatch[];
  rejected: Array<{ reason: string; raw: unknown }>;
}

// ── Prompt ───────────────────────────────────────────────────────────────────

export function buildReviewPrompt(
  meeting: {
    title: string;
    heldAt: string | null;
    summaryMd: string | null;
    transcriptMd: string | null;
  },
  snapshot: AtlasFactSnapshot
): { system: string; user: string } {
  const system = `You are Ask Juno reviewing an executive meeting for FACT CHANGES vs the Atlas dashboard. Compare what was stated/agreed in the meeting against the Atlas data provided. Output ONLY a JSON object:
{"suggestions": [{"entity": "project"|"opportunity"|"capital_source", "id": "<project_key or uuid from the Atlas data>", "field": "<field name from the Atlas data>", "current_value": <what Atlas holds>, "proposed_value": <what the meeting says>, "evidence": {"quote": "<verbatim transcript/summary quote>", "timestamp": "<if visible>"}}]}

Rules:
- ONLY propose changes the meeting clearly states or agrees. No inferences.
- Every suggestion MUST carry a verbatim evidence quote.
- Use ONLY the entity ids and field names present in the Atlas data below.
- Skip anything that already matches Atlas. At most ${MAX_SUGGESTIONS_PER_RUN}.
- Empty is fine: {"suggestions": []}.`;

  const user = `MEETING: ${meeting.title} (${meeting.heldAt ?? 'date unknown'})

SUMMARY:
${meeting.summaryMd ?? '(none)'}

TRANSCRIPT (may be truncated):
${(meeting.transcriptMd ?? '(none)').slice(0, 60_000)}

ATLAS DATA (current values — the comparison baseline):
${JSON.stringify(snapshot, null, 1).slice(0, 20_000)}`;

  return { system, user };
}

// ── Parse + validate ─────────────────────────────────────────────────────────

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function largeChange(current: unknown, proposed: unknown): boolean {
  if (!isNum(current) || !isNum(proposed)) return false;
  if (current === 0) return proposed !== 0;
  return Math.abs(proposed - current) / Math.abs(current) > LARGE_CHANGE_THRESHOLD;
}

function snapshotEntry(
  snapshot: AtlasFactSnapshot,
  entity: ReviewEntity,
  id: string
): { fields: Record<string, unknown> } | null {
  if (entity === 'project') {
    return snapshot.projects.find((p) => p.project_key === id) ?? null;
  }
  if (entity === 'opportunity') return snapshot.opportunities.find((o) => o.id === id) ?? null;
  return snapshot.capital_sources.find((c) => c.id === id) ?? null;
}

/**
 * Parse the model's review JSON into validated patches. NEVER throws on bad
 * model output — malformed items land in `rejected` with a reason.
 */
export function parseReviewSuggestions(
  raw: string,
  snapshot: AtlasFactSnapshot,
  meeting: { id: string; title: string }
): ParsedReview {
  const accepted: ProposedPatch[] = [];
  const rejected: ParsedReview['rejected'] = [];

  let items: unknown[] = [];
  try {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = fenced?.[1] ?? raw.match(/\{[\s\S]*\}/)?.[0] ?? raw;
    const obj = JSON.parse(jsonStr) as { suggestions?: unknown };
    items = Array.isArray(obj.suggestions) ? obj.suggestions : [];
  } catch {
    return { accepted, rejected: [{ reason: 'Model output was not valid JSON', raw }] };
  }

  for (const item of items) {
    if (accepted.length >= MAX_SUGGESTIONS_PER_RUN) {
      rejected.push({ reason: `Over the ${MAX_SUGGESTIONS_PER_RUN}-per-run cap`, raw: item });
      continue;
    }
    if (!item || typeof item !== 'object') {
      rejected.push({ reason: 'Not an object', raw: item });
      continue;
    }
    const s = item as Record<string, unknown>;
    const entity = String(s.entity ?? '') as ReviewEntity;
    const id = String(s.id ?? '');
    const field = String(s.field ?? '');
    const evidence = s.evidence as ReviewEvidence | undefined;

    if (!(entity in ALLOWED_FIELDS)) {
      rejected.push({ reason: `Unknown entity "${entity}"`, raw: item });
      continue;
    }
    if (!ALLOWED_FIELDS[entity].includes(field)) {
      rejected.push({ reason: `Field "${field}" is not editable on ${entity}`, raw: item });
      continue;
    }
    const entry = snapshotEntry(snapshot, entity, id);
    if (!entry) {
      rejected.push({ reason: `${entity} "${id}" not found in Atlas`, raw: item });
      continue;
    }
    const quote = evidence?.quote?.trim();
    if (!quote) {
      rejected.push({ reason: 'Missing evidence quote', raw: item });
      continue;
    }
    // Compare against the SNAPSHOT's current value, not the model's claim —
    // the model may hallucinate current_value; the snapshot is the truth.
    const current = entry.fields[field];
    const proposed = s.proposed_value;
    if (proposed === undefined) {
      rejected.push({ reason: 'Missing proposed_value', raw: item });
      continue;
    }
    if (JSON.stringify(proposed) === JSON.stringify(current)) {
      rejected.push({ reason: 'No-op — Atlas already holds this value', raw: item });
      continue;
    }

    accepted.push({
      entity,
      id,
      field,
      current_value: current,
      proposed_value: proposed,
      evidence: { quote: quote.slice(0, 1000), timestamp: evidence?.timestamp },
      large_change: largeChange(current, proposed),
      meeting_id: meeting.id,
      meeting_title: meeting.title,
    });
  }

  return { accepted, rejected };
}

/** Type guard the apply path uses on stored proposed_patch jsonb. */
export function isProposedPatch(v: unknown): v is ProposedPatch {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.entity === 'string' &&
    p.entity in ALLOWED_FIELDS &&
    typeof p.id === 'string' &&
    typeof p.field === 'string' &&
    ALLOWED_FIELDS[p.entity as ReviewEntity].includes(p.field as string) &&
    p.proposed_value !== undefined &&
    !!(p.evidence as ReviewEvidence | undefined)?.quote
  );
}
