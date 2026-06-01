/**
 * D-025a — Pricing briefs repo (atlas.pricing_briefs).
 *
 * Reads:
 *   - findCurrentBrief(projectId)   — the latest version regardless of status
 *   - findAppliedBrief(projectId)   — the brief whose status='applied' (if any)
 *   - findBriefById(briefId)
 *   - listBriefs(projectId)         — version desc, for the history dropdown
 *
 * Writes:
 *   - insertBrief({ ... })          — auto-bumps version, inserts row
 *   - markBriefApplied(briefId)     — flips status to 'applied'; supersedes
 *                                      the prior applied brief atomically
 *
 * The "apply" path also writes the recommended PSF back to
 * atlas.projects.sale_price_per_sqft_override_cents so the calc engine
 * picks it up. That's handled by the API route (not here) to keep this
 * repo single-purpose.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ProjectPhase, StrategyBrief } from '@/lib/pricing/strategy-brief';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type BriefStatus = 'draft' | 'applied' | 'superseded' | 'failed';

export interface PricingBriefView {
  id: string;
  projectId: string;
  version: number;
  status: BriefStatus;
  phase: ProjectPhase;
  recommendedLaunchPriceUsd: number | null;
  recommendedPsfUsd: number | null;
  expectedMarginPct: number | null;
  probWeightedMarginPct: number | null;
  oneLineThesis: string | null;
  brief: StrategyBrief;
  usedWebSearch: boolean;
  compCount: number;
  dataGap: boolean;
  generationError: string | null;
  appliedAt: string | null;
  appliedByUserId: string | null;
  generatedByUserId: string | null;
  createdAt: string;
}

interface PricingBriefRow {
  id: string;
  project_id: string;
  version: number;
  status: BriefStatus;
  phase: string;
  recommended_launch_price_cents: number | null;
  recommended_psf_cents: number | null;
  expected_margin_pct: number | string | null;
  prob_weighted_margin_pct: number | string | null;
  one_line_thesis: string | null;
  brief: StrategyBrief;
  used_web_search: boolean;
  comp_count: number;
  data_gap: boolean;
  generation_error: string | null;
  applied_at: string | null;
  applied_by_user_id: string | null;
  generated_by_user_id: string | null;
  created_at: string;
}

const ROW_SELECT =
  'id, project_id, version, status, phase, recommended_launch_price_cents, recommended_psf_cents, expected_margin_pct, prob_weighted_margin_pct, one_line_thesis, brief, used_web_search, comp_count, data_gap, generation_error, applied_at, applied_by_user_id, generated_by_user_id, created_at';

function toView(row: PricingBriefRow): PricingBriefView {
  return {
    id: row.id,
    projectId: row.project_id,
    version: row.version,
    status: row.status,
    phase: row.phase as ProjectPhase,
    recommendedLaunchPriceUsd:
      row.recommended_launch_price_cents != null
        ? Math.round(row.recommended_launch_price_cents / 100)
        : null,
    recommendedPsfUsd:
      row.recommended_psf_cents != null ? Math.round(row.recommended_psf_cents / 100) : null,
    expectedMarginPct: row.expected_margin_pct == null ? null : Number(row.expected_margin_pct),
    probWeightedMarginPct:
      row.prob_weighted_margin_pct == null ? null : Number(row.prob_weighted_margin_pct),
    oneLineThesis: row.one_line_thesis,
    brief: row.brief,
    usedWebSearch: row.used_web_search,
    compCount: row.comp_count,
    dataGap: row.data_gap,
    generationError: row.generation_error,
    appliedAt: row.applied_at,
    appliedByUserId: row.applied_by_user_id,
    generatedByUserId: row.generated_by_user_id,
    createdAt: row.created_at,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Reads
// ────────────────────────────────────────────────────────────────────────────

export async function findCurrentBrief(projectId: string): Promise<PricingBriefView | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('pricing_briefs')
    .select(ROW_SELECT)
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findCurrentBrief: ${error.message}`);
  return data ? toView(data as unknown as PricingBriefRow) : null;
}

export async function findAppliedBrief(projectId: string): Promise<PricingBriefView | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('pricing_briefs')
    .select(ROW_SELECT)
    .eq('project_id', projectId)
    .eq('status', 'applied')
    .maybeSingle();
  if (error) throw new Error(`findAppliedBrief: ${error.message}`);
  return data ? toView(data as unknown as PricingBriefRow) : null;
}

export async function findBriefById(briefId: string): Promise<PricingBriefView | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('pricing_briefs')
    .select(ROW_SELECT)
    .eq('id', briefId)
    .maybeSingle();
  if (error) throw new Error(`findBriefById: ${error.message}`);
  return data ? toView(data as unknown as PricingBriefRow) : null;
}

/**
 * D-026 — One brief per project (the latest version) across every project,
 * joined with project name + key so the dashboard can deep-link. Used by the
 * /pricing dashboard's "Active project recommendations" tile grid.
 */
export interface CurrentBriefForDashboard extends PricingBriefView {
  projectName: string;
  projectKey: string;
  projectMarketId: string;
  projectAddress: string | null;
}

export async function listAllCurrentBriefs(): Promise<CurrentBriefForDashboard[]> {
  const supabase = createSupabaseServerClient();
  // Pull every brief joined with the (current) project row, ordered so the
  // latest version per project is first. We dedupe client-side by project_id.
  const { data, error } = await supabase
    .schema('atlas')
    .from('pricing_briefs')
    .select(
      `${ROW_SELECT}, projects!inner ( project_key, name, market_id, address, is_current, is_archived )`
    )
    .order('project_id', { ascending: true })
    .order('version', { ascending: false });
  if (error) throw new Error(`listAllCurrentBriefs: ${error.message}`);

  const rowsRaw =
    (data as unknown as Array<
      PricingBriefRow & {
        projects: {
          project_key: string;
          name: string;
          market_id: string;
          address: string | null;
          is_current: boolean;
          is_archived: boolean;
        } | null;
      }
    >) ?? [];

  // Keep only one brief per project (the highest-version), and only when the
  // joined project row is still current + not archived.
  const seen = new Set<string>();
  const out: CurrentBriefForDashboard[] = [];
  for (const row of rowsRaw) {
    if (!row.projects || !row.projects.is_current || row.projects.is_archived) continue;
    if (seen.has(row.project_id)) continue;
    seen.add(row.project_id);
    const base = toView(row);
    out.push({
      ...base,
      projectName: row.projects.name,
      projectKey: row.projects.project_key,
      projectMarketId: row.projects.market_id,
      projectAddress: row.projects.address,
    });
  }
  // Sort applied first, then by version desc — matches the dashboard intent
  // ("what's actually driving the model" before "drafts I haven't decided on").
  out.sort((a, b) => {
    if (a.status === 'applied' && b.status !== 'applied') return -1;
    if (b.status === 'applied' && a.status !== 'applied') return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
  return out;
}

export async function listBriefs(projectId: string): Promise<PricingBriefView[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('pricing_briefs')
    .select(ROW_SELECT)
    .eq('project_id', projectId)
    .order('version', { ascending: false });
  if (error) throw new Error(`listBriefs: ${error.message}`);
  return ((data as unknown as PricingBriefRow[]) ?? []).map(toView);
}

// ────────────────────────────────────────────────────────────────────────────
// Writes
// ────────────────────────────────────────────────────────────────────────────

export interface InsertBriefInput {
  projectId: string;
  phase: ProjectPhase;
  brief: StrategyBrief;
  usedWebSearch: boolean;
  compCount: number;
  dataGap: boolean;
  generationError: string | null;
  generatedByUserId: string | null;
}

async function nextVersion(projectId: string): Promise<number> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('pricing_briefs')
    .select('version')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`nextVersion: ${error.message}`);
  const current = (data as { version: number } | null)?.version ?? 0;
  return current + 1;
}

export async function insertBrief(input: InsertBriefInput): Promise<PricingBriefView> {
  const version = await nextVersion(input.projectId);
  const supabase = createSupabaseServerClient();
  const launchUsd = input.brief.recommendation.launchPriceUsd;
  const psfUsd = input.brief.recommendation.psfAtLaunch;

  const insertPayload = {
    project_id: input.projectId,
    version,
    status: input.generationError ? 'failed' : 'draft',
    phase: input.phase,
    recommended_launch_price_cents: launchUsd != null ? Math.round(launchUsd * 100) : null,
    recommended_psf_cents: psfUsd != null ? Math.round(psfUsd * 100) : null,
    expected_margin_pct: input.brief.recommendation.expectedMarginPct ?? null,
    prob_weighted_margin_pct: input.brief.recommendation.probWeightedMarginPct ?? null,
    one_line_thesis: input.brief.recommendation.oneLineThesis ?? null,
    brief: input.brief,
    used_web_search: input.usedWebSearch,
    comp_count: input.compCount,
    data_gap: input.dataGap,
    generation_error: input.generationError,
    generated_by_user_id: input.generatedByUserId,
  };

  const { data, error } = await supabase
    .schema('atlas')
    .from('pricing_briefs')
    .insert(insertPayload)
    .select(ROW_SELECT)
    .single();

  if (error || !data) throw new Error(`insertBrief: ${error?.message ?? 'no row'}`);
  return toView(data as unknown as PricingBriefRow);
}

/**
 * Mark a brief as applied. Atomically supersedes the previously-applied
 * brief (if any) and flips this one to status='applied'. Caller is
 * responsible for writing the PSF back to projects.sale_price_per_sqft_override_cents.
 */
export async function markBriefApplied(briefId: string, userId: string): Promise<PricingBriefView> {
  const supabase = createSupabaseServerClient();

  // Look up the brief to find its project_id.
  const target = await findBriefById(briefId);
  if (!target) throw new Error(`markBriefApplied: brief ${briefId} not found`);
  if (target.status === 'applied') return target;

  // Supersede any currently-applied brief on the same project.
  await supabase
    .schema('atlas')
    .from('pricing_briefs')
    .update({ status: 'superseded' })
    .eq('project_id', target.projectId)
    .eq('status', 'applied');

  const { data, error } = await supabase
    .schema('atlas')
    .from('pricing_briefs')
    .update({
      status: 'applied',
      applied_at: new Date().toISOString(),
      applied_by_user_id: userId,
    })
    .eq('id', briefId)
    .select(ROW_SELECT)
    .single();

  if (error || !data) throw new Error(`markBriefApplied: ${error?.message ?? 'no row'}`);
  return toView(data as unknown as PricingBriefRow);
}
