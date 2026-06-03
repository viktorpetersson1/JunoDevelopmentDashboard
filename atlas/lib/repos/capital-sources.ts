/**
 * Capital Sources repo (V6.2 T118).
 *
 * Reads + raw writes for atlas.capital_sources and
 * atlas.capital_source_assignments. The service layer wraps these with the
 * E1 four-gate audit pattern.
 *
 * Versioning model mirrors atlas.projects: each edit writes a new row with
 * version+1 and flips the prior `is_current=false`. The partial unique index
 * `atlas_capital_sources_kind_current_unique` enforces "only one current per
 * (source_kind, source_name)" at the DB level.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';

export type SourceKind = 'kpc_loc' | 'project_finance' | 'recycled_equity';

export interface CapitalSourceView {
  id: string;
  sourceKind: SourceKind;
  sourceName: string;
  limitUsd: number;
  drawnUsd: number;
  /** Decimal — e.g. 0.06 for 6%. Null = unset. */
  interestRatePct: number | null;
  notes: string | null;
  /** Decimal — e.g. 0.75 for 75%. Null = no covenant enforced. */
  covenantMaxLtcPct: number | null;
  covenantMaxConcurrentProjects: number | null;
  drawWindowStartDate: string | null; // YYYY-MM-DD
  drawWindowEndDate: string | null;
  priorityOrder: number;
  version: number;
  isCurrent: boolean;
  isArchived: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Convenience: limitUsd - drawnUsd. Computed in the view, not stored. */
  headroomUsd: number;
}

interface CapitalSourceRow {
  id: string;
  source_kind: string;
  source_name: string;
  limit_usd: string | number;
  drawn_usd: string | number;
  interest_rate_pct: string | number | null;
  notes: string | null;
  covenant_max_ltc_pct: string | number | null;
  covenant_max_concurrent_projects: number | null;
  draw_window_start_date: string | null;
  draw_window_end_date: string | null;
  priority_order: number;
  version: number;
  is_current: boolean;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS = [
  'id',
  'source_kind',
  'source_name',
  'limit_usd',
  'drawn_usd',
  'interest_rate_pct',
  'notes',
  'covenant_max_ltc_pct',
  'covenant_max_concurrent_projects',
  'draw_window_start_date',
  'draw_window_end_date',
  'priority_order',
  'version',
  'is_current',
  'is_archived',
  'created_by',
  'created_at',
  'updated_at',
].join(',');

function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'string' ? Number(v) : v;
}

function toView(row: CapitalSourceRow): CapitalSourceView {
  const limitUsd = toNum(row.limit_usd);
  const drawnUsd = toNum(row.drawn_usd);
  return {
    id: row.id,
    sourceKind: row.source_kind as SourceKind,
    sourceName: row.source_name,
    limitUsd,
    drawnUsd,
    interestRatePct:
      row.interest_rate_pct === null
        ? null
        : Number(row.interest_rate_pct) / 100, // numeric column stores pct; convert to decimal
    notes: row.notes,
    // V6.2 stores covenant_max_ltc_pct as a decimal already (5,3 → 0.750 fits).
    covenantMaxLtcPct: row.covenant_max_ltc_pct === null ? null : Number(row.covenant_max_ltc_pct),
    covenantMaxConcurrentProjects: row.covenant_max_concurrent_projects,
    drawWindowStartDate: row.draw_window_start_date,
    drawWindowEndDate: row.draw_window_end_date,
    priorityOrder: row.priority_order,
    version: row.version,
    isCurrent: row.is_current,
    isArchived: row.is_archived,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    headroomUsd: Math.max(0, limitUsd - drawnUsd),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Reads
// ────────────────────────────────────────────────────────────────────────────

/**
 * List all current (non-archived) capital sources, ordered by priority then
 * by source_kind. This is the canonical funding stack — aggregator (T120)
 * walks this list in order.
 */
export async function findActiveCapitalSources(): Promise<CapitalSourceView[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('capital_sources')
    .select(SELECT_COLUMNS)
    .eq('is_current', true)
    .eq('is_archived', false)
    .order('priority_order', { ascending: true })
    .order('source_kind', { ascending: true });
  if (error) throw new Error(`findActiveCapitalSources: ${error.message}`);
  return ((data as unknown as CapitalSourceRow[]) ?? []).map(toView);
}

/** Fetch one source by uuid (any version). */
export async function findCapitalSourceById(id: string): Promise<CapitalSourceView | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('capital_sources')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`findCapitalSourceById: ${error.message}`);
  return data ? toView(data as unknown as CapitalSourceRow) : null;
}

/**
 * Find the active KPC LOC. Convenience for the Dashboard chip that has
 * historically read the single hardcoded KPC row.
 *
 * Returns null when no kpc_loc source is configured (caller falls back to
 * legacy hardcoded $6M @ 6% defaults — see dashboard/page.tsx).
 */
export async function findActiveKpcLoc(): Promise<CapitalSourceView | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('capital_sources')
    .select(SELECT_COLUMNS)
    .eq('source_kind', 'kpc_loc')
    .eq('is_current', true)
    .eq('is_archived', false)
    .order('priority_order', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findActiveKpcLoc: ${error.message}`);
  return data ? toView(data as unknown as CapitalSourceRow) : null;
}

// ────────────────────────────────────────────────────────────────────────────
// Per-project assignments
// ────────────────────────────────────────────────────────────────────────────

export interface AssignmentView {
  id: string;
  projectId: string;
  capitalSourceId: string;
  priority: number;
  createdAt: string;
  /** Optional join — present when the read joins capital_sources. */
  source?: CapitalSourceView;
}

interface AssignmentRow {
  id: string;
  project_id: string;
  capital_source_id: string;
  priority: number;
  created_at: string;
}

/**
 * Find ALL assignments across every project, ordered by project then priority.
 * Used by the portfolio-wide treasury surfaces (cash schedule, LOC repayment,
 * capacity solver) so they share one fetch shape instead of re-implementing it.
 */
export async function findAllAssignments(): Promise<AssignmentView[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('capital_source_assignments')
    .select('id, project_id, capital_source_id, priority, created_at')
    .order('project_id', { ascending: true })
    .order('priority', { ascending: true });
  if (error) throw new Error(`findAllAssignments: ${error.message}`);
  return ((data as unknown as AssignmentRow[]) ?? []).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    capitalSourceId: row.capital_source_id,
    priority: row.priority,
    createdAt: row.created_at,
  }));
}

/** Find assignments for a project, ordered by priority (lower drawn first). */
export async function findAssignmentsForProject(projectUuid: string): Promise<AssignmentView[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('capital_source_assignments')
    .select('id, project_id, capital_source_id, priority, created_at')
    .eq('project_id', projectUuid)
    .order('priority', { ascending: true });
  if (error) throw new Error(`findAssignmentsForProject: ${error.message}`);
  return ((data as unknown as AssignmentRow[]) ?? []).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    capitalSourceId: row.capital_source_id,
    priority: row.priority,
    createdAt: row.created_at,
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Writes (raw — service layer wraps with audit)
// ────────────────────────────────────────────────────────────────────────────

export interface InsertCapitalSourceVersionInput {
  sourceKind: SourceKind;
  sourceName: string;
  limitUsd: number;
  drawnUsd?: number;
  /** Decimal (0.06 = 6%). Stored as a percent in the column (numeric 5,3). */
  interestRatePct?: number | null;
  notes?: string | null;
  /** Decimal (0.75 = 75%). Stored as decimal in the column (numeric 5,3). */
  covenantMaxLtcPct?: number | null;
  covenantMaxConcurrentProjects?: number | null;
  drawWindowStartDate?: string | null;
  drawWindowEndDate?: string | null;
  priorityOrder?: number;
  /** auth.users.id of the editor — sets created_by on the new row. */
  createdBy: string;
}

/**
 * Insert a new VERSION of a capital source. Flips the prior current row's
 * is_current=false in the SAME logical operation (two writes; the DB
 * partial-unique index would reject both being current simultaneously).
 *
 * For the FIRST version (no current row exists for that source_kind + name),
 * this is just an insert.
 *
 * Returns the new row's id + version.
 *
 * Caller is responsible for the role gate (super_admin only).
 */
export async function insertCapitalSourceVersion(
  input: InsertCapitalSourceVersionInput,
): Promise<{ id: string; version: number }> {
  const supabase = createSupabaseServerClient();

  // Find current row to determine the next version number + archive trigger.
  const { data: currentRows, error: findErr } = await supabase
    .schema('atlas')
    .from('capital_sources')
    .select('id, version')
    .eq('source_kind', input.sourceKind)
    .eq('source_name', input.sourceName)
    .eq('is_current', true)
    .eq('is_archived', false)
    .maybeSingle();
  if (findErr) throw new Error(`insertCapitalSourceVersion lookup: ${findErr.message}`);

  const prior = currentRows as { id: string; version: number } | null;
  const nextVersion = prior ? prior.version + 1 : 1;

  // Demote the prior current row FIRST so the partial unique index is happy.
  if (prior) {
    const { error: demoteErr } = await supabase
      .schema('atlas')
      .from('capital_sources')
      .update({ is_current: false, updated_at: new Date().toISOString() })
      .eq('id', prior.id);
    if (demoteErr) throw new Error(`insertCapitalSourceVersion demote: ${demoteErr.message}`);
  }

  // Insert the new current row.
  const insertRow: Record<string, unknown> = {
    source_kind: input.sourceKind,
    source_name: input.sourceName,
    limit_usd: input.limitUsd,
    drawn_usd: input.drawnUsd ?? 0,
    interest_rate_pct:
      input.interestRatePct == null ? null : input.interestRatePct * 100, // decimal → pct for the column
    notes: input.notes ?? null,
    covenant_max_ltc_pct: input.covenantMaxLtcPct ?? null,
    covenant_max_concurrent_projects: input.covenantMaxConcurrentProjects ?? null,
    draw_window_start_date: input.drawWindowStartDate ?? null,
    draw_window_end_date: input.drawWindowEndDate ?? null,
    priority_order: input.priorityOrder ?? 0,
    version: nextVersion,
    is_current: true,
    is_archived: false,
    created_by: input.createdBy,
  };

  const { data, error } = await supabase
    .schema('atlas')
    .from('capital_sources')
    .insert(insertRow)
    .select('id, version')
    .single();

  if (error) {
    // Best-effort: try to restore the prior row's is_current if we demoted it
    // and the new insert failed (avoids leaving the source with no current row).
    if (prior) {
      await supabase
        .schema('atlas')
        .from('capital_sources')
        .update({ is_current: true })
        .eq('id', prior.id);
    }
    throw new Error(`insertCapitalSourceVersion insert: ${error.message}`);
  }

  return {
    id: (data as { id: string; version: number }).id,
    version: (data as { id: string; version: number }).version,
  };
}

/** Soft-archive a source — sets is_archived=true. */
export async function archiveCapitalSource(id: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .schema('atlas')
    .from('capital_sources')
    .update({ is_archived: true, is_current: false, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`archiveCapitalSource: ${error.message}`);
}

/**
 * Replace a project's full assignment set. Atomic-ish: deletes the prior
 * set then inserts the new set. Order matters — `sourceIds[0]` becomes the
 * highest-priority source (lowest priority integer).
 */
export async function setAssignments(
  projectUuid: string,
  sourceIds: string[],
  createdBy: string,
): Promise<void> {
  const supabase = createSupabaseServerClient();

  // Delete the prior set.
  const { error: delErr } = await supabase
    .schema('atlas')
    .from('capital_source_assignments')
    .delete()
    .eq('project_id', projectUuid);
  if (delErr) throw new Error(`setAssignments delete: ${delErr.message}`);

  if (sourceIds.length === 0) return; // empty assignment → degenerate to KPC LOC at read time

  // Insert the new set with priority = array index.
  const rows = sourceIds.map((sourceId, i) => ({
    project_id: projectUuid,
    capital_source_id: sourceId,
    priority: i,
    created_by: createdBy,
  }));

  const { error: insErr } = await supabase
    .schema('atlas')
    .from('capital_source_assignments')
    .insert(rows);
  if (insErr) throw new Error(`setAssignments insert: ${insErr.message}`);
}
