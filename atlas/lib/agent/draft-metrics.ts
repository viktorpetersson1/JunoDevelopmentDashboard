/**
 * V7 T145 — pipeline research assistant (pure seam).
 *
 * Given an opportunity's notes/research, the agent drafts the standardized
 * key metrics (cash needed · timeline · expected profit/margin · suggested
 * next step) AS A DRAFT the user reviews in a pre-filled form — never a
 * direct write (the route returns the draft; the ONLY persistence path is
 * the user pressing Save on the existing PATCH).
 */

import type { OpportunityView } from '@/lib/repos/opportunities';

export interface DraftMetrics {
  cash_needed_usd: number | null;
  timeline_months: number | null;
  expected_profit_usd: number | null;
  expected_margin_pct: number | null;
  next_step: string | null;
  /** The model's reasoning summary — rendered under the form. */
  reasoning: string;
}

export function buildDraftPrompt(opp: OpportunityView): { system: string; user: string } {
  const system = `You are Ask Juno drafting the standardized deal-sheet metrics for a real-estate development opportunity (spec villas, Hamptons-style economics unless stated otherwise). Estimate conservatively from the notes provided; use null for anything the notes cannot support — a research gap must stay visible, never a guessed zero. Output ONLY JSON:
{"cash_needed_usd": number|null, "timeline_months": number|null, "expected_profit_usd": number|null, "expected_margin_pct": number|null, "next_step": string|null, "reasoning": "<3-6 sentences: how you derived each number, what is missing>"}`;

  const research = opp.research;
  const user = `OPPORTUNITY: ${opp.name}${opp.market ? ` (${opp.market.replaceAll('_', ' ')})` : ''}
STATUS: ${opp.status} · OWNER: ${opp.ownerName ?? 'unassigned'}
CURRENT METRICS: cash_needed=${opp.cashNeededUsd ?? 'null'} timeline=${opp.timelineMonths ?? 'null'} profit=${opp.expectedProfitUsd ?? 'null'} margin=${opp.expectedMarginPct ?? 'null'}

NOTES:
${opp.notes ?? '(none)'}

RESEARCH NOTES:
${research.notes_md ?? '(none)'}

DECISION LOG:
${(research.decision_log ?? []).map((d) => `${d.date} — ${d.note}`).join('\n') || '(none)'}`;

  return { system, user };
}

const num = (v: unknown, min: number, max: number): number | null => {
  // null/undefined stay null — Number(null) is 0, which would turn a research
  // gap into a fake zero (the exact thing Rule 6 bans).
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(n, min), max);
};

/** Parse + clamp the model's draft. Never throws — a bad response returns
 *  all-null metrics with the raw text as reasoning so the user still sees
 *  what happened. */
export function parseDraftMetrics(raw: string): DraftMetrics {
  try {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = fenced?.[1] ?? raw.match(/\{[\s\S]*\}/)?.[0] ?? raw;
    const obj = JSON.parse(jsonStr) as Record<string, unknown>;
    const months = num(obj.timeline_months, 0, 240);
    return {
      cash_needed_usd: num(obj.cash_needed_usd, 0, 1_000_000_000),
      // QA fix: no `|| null` here — `0 || null` is null in JS, which would
      // turn a real "0 months to cash-back" answer into a fake research gap.
      timeline_months: months === null ? null : Math.round(months),
      expected_profit_usd: num(obj.expected_profit_usd, -1_000_000_000, 1_000_000_000),
      expected_margin_pct: num(obj.expected_margin_pct, -100, 100),
      next_step: typeof obj.next_step === 'string' ? obj.next_step.slice(0, 500) : null,
      reasoning:
        typeof obj.reasoning === 'string' && obj.reasoning.trim()
          ? obj.reasoning.slice(0, 4000)
          : 'No reasoning provided.',
    };
  } catch {
    return {
      cash_needed_usd: null,
      timeline_months: null,
      expected_profit_usd: null,
      expected_margin_pct: null,
      next_step: null,
      reasoning: `Model output was not valid JSON: ${raw.slice(0, 500)}`,
    };
  }
}
