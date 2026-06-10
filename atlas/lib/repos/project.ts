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
import { log } from '@/lib/utils/log';
import type { ProjectInput } from '@/lib/calc/project/types';
import type { WaterfrontType, ViewPremium, TownProximity } from '@/lib/pricing/location-factors';
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
  'waterfront_type',
  'lot_size_acres',
  'year_built',
  'view_premium',
  'town_proximity',
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
  'cost_breakdown',
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
  'tax_rate_bps',
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
 * V6.2 T120 — Fetch current projects with their DB uuid alongside the
 * ProjectInput shape. The treasury aggregator needs uuids for the
 * capital-source assignment lookup; this avoids N round-trips via
 * findCurrentProjectUuidByKey.
 */
export async function findManyProjectsWithUuids(
  opts: ListProjectsOptions = {},
): Promise<Array<{ uuid: string; input: ProjectInput }>> {
  const supabase = createSupabaseServerClient();
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);

  let query = supabase
    .schema('atlas')
    .from('projects')
    .select(SELECT_COLUMNS)
    .eq('is_current', true)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (opts.stage) query = query.eq('stage', opts.stage);
  if (opts.status) query = query.eq('status', opts.status);

  const { data, error } = await query;
  if (error) throw new Error(`findManyProjectsWithUuids: ${error.message}`);

  return ((data as unknown as ProjectRow[]) ?? []).map((row) => ({
    uuid: row.id,
    input: projectRowToInput(row),
  }));
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
export async function findCurrentProjectUuidByKey(projectKey: string): Promise<string | null> {
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
  return (data as { id: string } | null)?.id ?? null;
}

export interface ProjectLocationFactorsPatch {
  waterfrontType?: WaterfrontType | null;
  viewPremium?: ViewPremium | null;
  townProximity?: TownProximity | null;
  lotSizeAcres?: number | null;
  yearBuilt?: number | null;
}

/**
 * In-place enrichment of the current project row's location factors (D-025b
 * auto-detect). Only the keys present in `patch` are written, so a caller can
 * fill blanks without clobbering human-set values. No version bump — this is
 * metadata enrichment, not a user edit. No-op when `patch` is empty.
 */
export async function updateProjectLocationFactors(
  projectUuid: string,
  patch: ProjectLocationFactorsPatch
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.waterfrontType !== undefined) update.waterfront_type = patch.waterfrontType;
  if (patch.viewPremium !== undefined) update.view_premium = patch.viewPremium;
  if (patch.townProximity !== undefined) update.town_proximity = patch.townProximity;
  if (patch.lotSizeAcres !== undefined) update.lot_size_acres = patch.lotSizeAcres;
  if (patch.yearBuilt !== undefined) update.year_built = patch.yearBuilt;
  if (Object.keys(update).length === 0) return;
  update.updated_at = new Date().toISOString();

  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .schema('atlas')
    .from('projects')
    .update(update)
    .eq('id', projectUuid)
    .eq('is_current', true)
    .eq('is_archived', false);
  if (error) throw new Error(`updateProjectLocationFactors: ${error.message}`);
}

// ── V6.1.5-019 — documented pricing premium (deterministic engine input) ─────

export interface ProjectPricingPremium {
  premiumPct: number | null;
  premiumBasis: string | null;
}

/** Read the documented premium for the current project row (null = price-taker). */
export async function getProjectPricingPremium(
  projectUuid: string
): Promise<ProjectPricingPremium> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('projects')
    .select('pricing_premium_pct, pricing_premium_basis')
    .eq('id', projectUuid)
    .eq('is_current', true)
    .eq('is_archived', false)
    .maybeSingle();
  if (error) throw new Error(`getProjectPricingPremium: ${error.message}`);
  const row = data as {
    pricing_premium_pct: number | string | null;
    pricing_premium_basis: string | null;
  } | null;
  return {
    premiumPct: row?.pricing_premium_pct != null ? Number(row.pricing_premium_pct) : null,
    premiumBasis: row?.pricing_premium_basis ?? null,
  };
}

/**
 * Persist the documented premium. Like updateProjectLocationFactors this is a
 * pricing-engine input, not a financial edit — no version bump, no re-approval.
 */
export async function updateProjectPricingPremium(
  projectUuid: string,
  premium: ProjectPricingPremium
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .schema('atlas')
    .from('projects')
    .update({
      pricing_premium_pct: premium.premiumPct,
      pricing_premium_basis: premium.premiumBasis,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectUuid)
    .eq('is_current', true)
    .eq('is_archived', false);
  if (error) throw new Error(`updateProjectPricingPremium: ${error.message}`);
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

// ────────────────────────────────────────────────────────────────────────────
// Edit / version-bump (V6.1 T104)
// ────────────────────────────────────────────────────────────────────────────

export class ProjectNotFoundError extends Error {
  readonly code = 'PROJECT_NOT_FOUND';
  constructor(public projectKey: string) {
    super(`Project "${projectKey}" not found`);
    this.name = 'ProjectNotFoundError';
  }
}

/** Read the full raw row (ALL columns, untransformed) of the current project
 *  version. Unlike findCurrentProjectByKey (which returns the calc-shaped
 *  ProjectInput), this returns the raw DB row so a version bump can copy every
 *  column forward — including ones not in ProjectRow (plot_types,
 *  applied_pricing_run_id, the V6.1 edit-tracking columns). Null when missing. */
export async function findCurrentProjectFullRowByKey(
  projectKey: string
): Promise<Record<string, unknown> | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('projects')
    .select('*')
    .eq('project_key', projectKey)
    .eq('is_current', true)
    .eq('is_archived', false)
    .maybeSingle();
  if (error) throw new Error(`findCurrentProjectFullRowByKey: ${error.message}`);
  return (data as Record<string, unknown> | null) ?? null;
}

export interface ApplyProjectEditParams {
  projectKey: string;
  /** Raw atlas.projects column names → values, cents/bps already applied. */
  columnPatch: Record<string, unknown>;
  editedBy: string;
  editSource: 'ui' | 'csv_import' | 'ask_juno_agent' | 'api';
}

/**
 * Persist a project edit as a version bump. V6.1 T104.
 *
 * IMPORTANT (V6.1 deviation from doc §3b E4): the current row's UUID is kept
 * STABLE. We update the current row IN PLACE (new column values + bumped
 * `version`) and archive the PRE-EDIT state as a new historical row
 * (is_current=false). This inverts the naive "new row becomes current, flip
 * old" model because approval_snapshots.project_id is an FK to a specific
 * project-version UUID and the immutability trigger forbids repointing locked
 * snapshots — a fresh current UUID would orphan the re-approval gate
 * (findLatestLockedSnapshot) and the snapshot banner. Keeping the UUID stable
 * preserves snapshot linkage AND keeps the prior version queryable (E4 intent;
 * the audit log holds the authoritative before/after per E9).
 *
 * Returns the (unchanged) current UUID + the new version number.
 */
export async function applyProjectEdit(
  params: ApplyProjectEditParams
): Promise<{ id: string; version: number }> {
  const { projectKey, columnPatch, editedBy, editSource } = params;
  const supabase = createSupabaseServerClient();

  // 1. Read the full current row so we can archive its pre-edit state.
  const current = await findCurrentProjectFullRowByKey(projectKey);
  if (!current) throw new ProjectNotFoundError(projectKey);
  const currentId = current.id as string;
  const currentVersion = current.version as number;

  // 2. Next version = max existing version for this key + 1 (don't reuse a
  //    number an archived row already holds).
  const { data: maxRow, error: maxErr } = await supabase
    .schema('atlas')
    .from('projects')
    .select('version')
    .eq('project_key', projectKey)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) throw new Error(`applyProjectEdit max version: ${maxErr.message}`);
  const nextVersion = ((maxRow as { version: number } | null)?.version ?? currentVersion) + 1;

  // 3. Update the current row IN PLACE — uuid stays stable, is_current stays
  //    true. Frees `currentVersion` for the archive row in step 4.
  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabase
    .schema('atlas')
    .from('projects')
    .update({
      ...columnPatch,
      version: nextVersion,
      last_edited_by_user_id: editedBy,
      last_edited_at: nowIso,
      edit_source: editSource,
      updated_at: nowIso,
    })
    .eq('id', currentId)
    .eq('is_current', true);
  if (updErr) throw new Error(`applyProjectEdit update: ${updErr.message}`);

  // 4. Archive the PRE-EDIT state as a new historical row (best-effort —
  //    the audit log is the authoritative history per E9, so a failure here
  //    must not fail the user's edit). currentVersion is now free.
  const historical: Record<string, unknown> = { ...current };
  delete historical.id; // mint a new uuid
  delete historical.created_at; // default now()
  delete historical.updated_at; // default now()
  historical.is_current = false;
  historical.is_archived = false;
  historical.version = currentVersion;
  const { error: histErr } = await supabase
    .schema('atlas')
    .from('projects')
    .insert(historical);
  if (histErr) {
    log.warn('applyProjectEdit: history copy failed (edit + audit still applied)', {
      projectKey,
      version: currentVersion,
      error: histErr.message,
    });
  }

  return { id: currentId, version: nextVersion };
}
