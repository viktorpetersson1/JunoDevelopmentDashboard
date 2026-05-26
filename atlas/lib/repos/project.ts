/**
 * Project repo — the ONLY place that reads `atlas.projects`. Services call
 * repos, routes call services. Per CLAUDE.md §5.
 *
 * Reads return `ProjectInput` (the calc-engine shape). Writes are server-
 * only and live in `lib/services/project.ts` (T044+).
 *
 * All queries scope to non-archived current rows (`is_current=true AND
 * is_archived=false`). Historical / archived versions are accessed via
 * `findVersionById` for audit drilldown.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ProjectInput } from '@/lib/calc/project/types';
import { projectRowToInput, type ProjectRow } from './project-row-to-input';

const SELECT_COLUMNS = [
  'id',
  'project_key',
  'version',
  'is_current',
  'is_archived',
  'name',
  'address',
  'google_maps_url',
  'entity_spv',
  'market_id',
  'asset_type',
  'status',
  'stage',
  'purchase_date',
  'sourcing_months',
  'permitting_preconstruction_months',
  'construction_months',
  'sales_months',
  'villa_sqft_ag',
  'villa_sqft_bg',
  'land_cost_cents',
  'build_cost_per_sqft_cents',
  'soft_costs_lump_sum_cents',
  'soft_costs_breakdown',
  'lender_name',
  'senior_ltv_bps',
  'interest_rate_bps',
  'contingency_bps',
  'origination_fee_bps',
  'exit_fee_bps',
  'interest_reserve_cents',
  'loan_servicing_fee_cents',
  'closing_costs_cents',
  'other_fees',
  'sale_price_override_cents',
  'sale_price_per_sqft_override_cents',
  'target_margin_bps',
  'listing_date',
  'under_contract_date',
  'closing_date',
  'listing_price_cents',
  'actual_sale_price_cents',
  'build_cost_curve',
  'created_by',
  'created_at',
  'updated_at',
].join(',');

export interface ListProjectsOptions {
  /** Filter by stage (sourcing | pre_construction | construction | ...) */
  stage?: string;
  /** Filter by status (pipeline | committed) */
  status?: string;
  /** Substring match against name + address. */
  q?: string;
  /** Cursor (project_key, created_at) for pagination. */
  cursor?: { projectKey: string; createdAt: string } | null;
  limit?: number;
}

export interface ListProjectsResult {
  projects: ProjectInput[];
  nextCursor: { projectKey: string; createdAt: string } | null;
}

/**
 * List current (non-archived) projects, optionally filtered + cursor-paginated.
 * Order: created_at DESC for stable cursor pagination.
 */
export async function findManyProjects(
  opts: ListProjectsOptions = {}
): Promise<ListProjectsResult> {
  const supabase = createSupabaseServerClient();
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);

  let query = supabase
    .schema('atlas')
    .from('projects')
    .select(SELECT_COLUMNS)
    .eq('is_current', true)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .order('project_key', { ascending: false })
    .limit(limit + 1); // +1 to detect next page

  if (opts.stage) query = query.eq('stage', opts.stage);
  if (opts.status) query = query.eq('status', opts.status);
  if (opts.q) {
    // Postgres ILIKE on name OR address. Supabase or() expects each predicate
    // comma-separated; ilike values must escape leading punctuation.
    const escaped = opts.q.replaceAll(',', '').replaceAll('(', '').replaceAll(')', '');
    query = query.or(`name.ilike.%${escaped}%,address.ilike.%${escaped}%`);
  }
  if (opts.cursor) {
    // Cursor: created_at < cursor.createdAt OR (= AND project_key < cursor.projectKey)
    query = query.or(
      `created_at.lt.${opts.cursor.createdAt},and(created_at.eq.${opts.cursor.createdAt},project_key.lt.${opts.cursor.projectKey})`
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(`findManyProjects: ${error.message}`);

  const rows = (data as unknown as ProjectRow[]) ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last ? { projectKey: last.project_key, createdAt: last.created_at } : null;

  return {
    projects: page.map(projectRowToInput),
    nextCursor,
  };
}

/**
 * Fetch the current (non-archived) version of one project by its stable key.
 * Returns null when not found.
 */
export async function findCurrentProjectByKey(projectKey: string): Promise<ProjectInput | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('projects')
    .select(SELECT_COLUMNS)
    .eq('project_key', projectKey)
    .eq('is_current', true)
    .eq('is_archived', false)
    .maybeSingle();

  if (error) throw new Error(`findCurrentProjectByKey: ${error.message}`);
  if (!data) return null;
  return projectRowToInput(data as unknown as ProjectRow);
}

/**
 * Resolve a project_key (slug, e.g. "p2") to the row's UUID. Returns null
 * when not found. Capital calls / approval snapshots / pricing runs all
 * reference projects by uuid, but pages route by project_key — this is
 * the boundary translator.
 */
export async function findCurrentProjectUuidByKey(
  projectKey: string
): Promise<string | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('projects')
    .select('id')
    .eq('project_key', projectKey)
    .eq('is_current', true)
    .eq('is_archived', false)
    .maybeSingle();
  if (error) throw new Error(`findCurrentProjectUuidByKey: ${error.message}`);
  return ((data as { id: string } | null)?.id) ?? null;
}

/**
 * Fetch a specific row by its uuid id (historical version lookup; used for
 * snapshot audit drilldown in W1.5).
 */
export async function findProjectRowById(id: string): Promise<ProjectInput | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('projects')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`findProjectRowById: ${error.message}`);
  if (!data) return null;
  return projectRowToInput(data as unknown as ProjectRow);
}
