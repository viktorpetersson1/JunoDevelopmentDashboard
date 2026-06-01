/**
 * Pricing-framework repo. Spans three tables:
 *   - atlas.pricing_runs               (run header)
 *   - atlas.pricing_run_plot_outputs   (L/B/H per plot type)
 *   - atlas.pricing_run_comparables    (snapshot of comps cited by the run)
 *
 * Raw CRUD + read shapes only. All classification / triangulation /
 * confidence rules live in `lib/services/pricing-framework.ts`. The DB
 * trigger `atlas.enforce_pricing_run_immutability` is the floor — this
 * repo never tries to mutate a committed run's content.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  PricingRunMode,
  PricingRunStatus,
  PricingRunTriggerSource,
  PricingRunCompRole,
  PlotClassification,
  PlotConfidence,
  PlotDerivation,
} from '@/lib/db/schema/pricing-runs';

// ────────────────────────────────────────────────────────────────────────────
// View types
// ────────────────────────────────────────────────────────────────────────────

export interface PricingRunView {
  id: string;
  projectId: string;
  version: number;
  mode: PricingRunMode;
  triggerSource: PricingRunTriggerSource;
  triggeredByUserId: string | null;
  status: PricingRunStatus;
  compWindowStart: string;
  compWindowEnd: string;
  narrativeSummary: string | null;
  buyerMigrationThesis: string | null;
  reconciliationTable: unknown | null;
  appliedAt: string | null;
  appliedByUserId: string | null;
  committedAt: string | null;
  committedByUserId: string | null;
  createdAt: string;
}

export interface PricingRunComparableView {
  id: string;
  pricingRunId: string;
  compId: string | null;
  snapshotAddress: string;
  snapshotSubCutKey: string;
  snapshotWaterfrontType: string;
  snapshotIsNc: boolean;
  snapshotStatus: string;
  snapshotClosingDate: string | null;
  snapshotSalePriceCents: number | null;
  snapshotAgSqft: number;
  snapshotLotSizeAcres: number | null;
  snapshotYearBuilt: number | null;
  snapshotSourceUrl: string | null;
  snapshotPsf: number | null;
  role: PricingRunCompRole;
  usedForPlotTypeKeys: string[];
  isPrimaryInSubCut: boolean;
  createdAt: string;
}

export interface PricingRunPlotOutputView {
  id: string;
  pricingRunId: string;
  plotTypeKey: string;
  plotTypeLabel: string;
  subCutKey: string;
  plotCount: number;
  sqftPerUnitAg: number;
  // Human-committed L/B/H + anchors
  lowPsf: number | null;
  basePsf: number | null;
  highPsf: number | null;
  lowAnchorCompSnapshotId: string | null;
  baseAnchorCompSnapshotId: string | null;
  highAnchorCompSnapshotId: string | null;
  // Engine-derived
  lowPremiumPct: number | null;
  basePremiumPct: number | null;
  highPremiumPct: number | null;
  lowDerivation: PlotDerivation | null;
  baseDerivation: PlotDerivation | null;
  highDerivation: PlotDerivation | null;
  dataGapFlag: boolean | null;
  triangulationReasoning: string | null;
  classification: PlotClassification | null;
  confidence: PlotConfidence | null;
  strongestInSubCutPsf: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PricingRunBundleView {
  run: PricingRunView;
  plotOutputs: PricingRunPlotOutputView[];
  comparables: PricingRunComparableView[];
}

// ────────────────────────────────────────────────────────────────────────────
// Numeric helper — Postgres `numeric` arrives as string in JSON
// ────────────────────────────────────────────────────────────────────────────

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Row → View mappers
// ────────────────────────────────────────────────────────────────────────────

interface PricingRunRow {
  id: string;
  project_id: string;
  version: number;
  mode: PricingRunMode;
  trigger_source: PricingRunTriggerSource;
  triggered_by_user_id: string | null;
  status: PricingRunStatus;
  comp_window_start: string;
  comp_window_end: string;
  narrative_summary: string | null;
  buyer_migration_thesis: string | null;
  reconciliation_table: unknown | null;
  applied_at: string | null;
  applied_by_user_id: string | null;
  committed_at: string | null;
  committed_by_user_id: string | null;
  created_at: string;
}

function toRunView(row: PricingRunRow): PricingRunView {
  return {
    id: row.id,
    projectId: row.project_id,
    version: row.version,
    mode: row.mode,
    triggerSource: row.trigger_source,
    triggeredByUserId: row.triggered_by_user_id,
    status: row.status,
    compWindowStart: row.comp_window_start,
    compWindowEnd: row.comp_window_end,
    narrativeSummary: row.narrative_summary,
    buyerMigrationThesis: row.buyer_migration_thesis,
    reconciliationTable: row.reconciliation_table,
    appliedAt: row.applied_at,
    appliedByUserId: row.applied_by_user_id,
    committedAt: row.committed_at,
    committedByUserId: row.committed_by_user_id,
    createdAt: row.created_at,
  };
}

interface PlotOutputRow {
  id: string;
  pricing_run_id: string;
  plot_type_key: string;
  plot_type_label: string;
  sub_cut_key: string;
  plot_count: number;
  sqft_per_unit_ag: number;
  low_psf: string | number | null;
  base_psf: string | number | null;
  high_psf: string | number | null;
  low_anchor_comp_snapshot_id: string | null;
  base_anchor_comp_snapshot_id: string | null;
  high_anchor_comp_snapshot_id: string | null;
  low_premium_pct: string | number | null;
  base_premium_pct: string | number | null;
  high_premium_pct: string | number | null;
  low_derivation: PlotDerivation | null;
  base_derivation: PlotDerivation | null;
  high_derivation: PlotDerivation | null;
  data_gap_flag: boolean | null;
  triangulation_reasoning: string | null;
  classification: PlotClassification | null;
  confidence: PlotConfidence | null;
  strongest_in_sub_cut_psf: string | number | null;
  created_at: string;
  updated_at: string;
}

function toPlotOutputView(row: PlotOutputRow): PricingRunPlotOutputView {
  return {
    id: row.id,
    pricingRunId: row.pricing_run_id,
    plotTypeKey: row.plot_type_key,
    plotTypeLabel: row.plot_type_label,
    subCutKey: row.sub_cut_key,
    plotCount: row.plot_count,
    sqftPerUnitAg: row.sqft_per_unit_ag,
    lowPsf: num(row.low_psf),
    basePsf: num(row.base_psf),
    highPsf: num(row.high_psf),
    lowAnchorCompSnapshotId: row.low_anchor_comp_snapshot_id,
    baseAnchorCompSnapshotId: row.base_anchor_comp_snapshot_id,
    highAnchorCompSnapshotId: row.high_anchor_comp_snapshot_id,
    lowPremiumPct: num(row.low_premium_pct),
    basePremiumPct: num(row.base_premium_pct),
    highPremiumPct: num(row.high_premium_pct),
    lowDerivation: row.low_derivation,
    baseDerivation: row.base_derivation,
    highDerivation: row.high_derivation,
    dataGapFlag: row.data_gap_flag,
    triangulationReasoning: row.triangulation_reasoning,
    classification: row.classification,
    confidence: row.confidence,
    strongestInSubCutPsf: num(row.strongest_in_sub_cut_psf),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface ComparableRow {
  id: string;
  pricing_run_id: string;
  comp_id: string | null;
  snapshot_address: string;
  snapshot_sub_cut_key: string;
  snapshot_waterfront_type: string;
  snapshot_is_nc: boolean;
  snapshot_status: string;
  snapshot_closing_date: string | null;
  snapshot_sale_price_cents: number | null;
  snapshot_ag_sqft: number;
  snapshot_lot_size_acres: string | number | null;
  snapshot_year_built: number | null;
  snapshot_source_url: string | null;
  snapshot_psf: string | number | null;
  role: PricingRunCompRole;
  used_for_plot_type_keys: string[] | null;
  is_primary_in_sub_cut: boolean;
  created_at: string;
}

function toComparableView(row: ComparableRow): PricingRunComparableView {
  return {
    id: row.id,
    pricingRunId: row.pricing_run_id,
    compId: row.comp_id,
    snapshotAddress: row.snapshot_address,
    snapshotSubCutKey: row.snapshot_sub_cut_key,
    snapshotWaterfrontType: row.snapshot_waterfront_type,
    snapshotIsNc: row.snapshot_is_nc,
    snapshotStatus: row.snapshot_status,
    snapshotClosingDate: row.snapshot_closing_date,
    snapshotSalePriceCents: row.snapshot_sale_price_cents,
    snapshotAgSqft: row.snapshot_ag_sqft,
    snapshotLotSizeAcres: num(row.snapshot_lot_size_acres),
    snapshotYearBuilt: row.snapshot_year_built,
    snapshotSourceUrl: row.snapshot_source_url,
    snapshotPsf: num(row.snapshot_psf),
    role: row.role,
    usedForPlotTypeKeys: row.used_for_plot_type_keys ?? [],
    isPrimaryInSubCut: row.is_primary_in_sub_cut,
    createdAt: row.created_at,
  };
}

const RUN_COLUMNS =
  'id, project_id, version, mode, trigger_source, triggered_by_user_id, status, comp_window_start, comp_window_end, narrative_summary, buyer_migration_thesis, reconciliation_table, applied_at, applied_by_user_id, committed_at, committed_by_user_id, created_at';
const PLOT_COLUMNS =
  'id, pricing_run_id, plot_type_key, plot_type_label, sub_cut_key, plot_count, sqft_per_unit_ag, low_psf, base_psf, high_psf, low_anchor_comp_snapshot_id, base_anchor_comp_snapshot_id, high_anchor_comp_snapshot_id, low_premium_pct, base_premium_pct, high_premium_pct, low_derivation, base_derivation, high_derivation, data_gap_flag, triangulation_reasoning, classification, confidence, strongest_in_sub_cut_psf, created_at, updated_at';
const COMP_COLUMNS =
  'id, pricing_run_id, comp_id, snapshot_address, snapshot_sub_cut_key, snapshot_waterfront_type, snapshot_is_nc, snapshot_status, snapshot_closing_date, snapshot_sale_price_cents, snapshot_ag_sqft, snapshot_lot_size_acres, snapshot_year_built, snapshot_source_url, snapshot_psf, role, used_for_plot_type_keys, is_primary_in_sub_cut, created_at';

// ────────────────────────────────────────────────────────────────────────────
// Reads
// ────────────────────────────────────────────────────────────────────────────

export async function findRunById(id: string): Promise<PricingRunView | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('pricing_runs')
    .select(RUN_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`findRunById: ${error.message}`);
  return data ? toRunView(data as unknown as PricingRunRow) : null;
}

export async function listRunsByProject(
  projectId: string,
  opts: { includeArchived?: boolean; limit?: number } = {}
): Promise<PricingRunView[]> {
  const supabase = createSupabaseServerClient();
  let q = supabase
    .schema('atlas')
    .from('pricing_runs')
    .select(RUN_COLUMNS)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (!opts.includeArchived) q = q.neq('status', 'archived');
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw new Error(`listRunsByProject: ${error.message}`);
  return ((data as unknown as PricingRunRow[]) ?? []).map(toRunView);
}

export async function findLatestCommittedRun(projectId: string): Promise<PricingRunView | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('pricing_runs')
    .select(RUN_COLUMNS)
    .eq('project_id', projectId)
    .eq('status', 'committed')
    .order('committed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findLatestCommittedRun: ${error.message}`);
  return data ? toRunView(data as unknown as PricingRunRow) : null;
}

export async function listPlotOutputsForRun(runId: string): Promise<PricingRunPlotOutputView[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('pricing_run_plot_outputs')
    .select(PLOT_COLUMNS)
    .eq('pricing_run_id', runId)
    .order('plot_type_key', { ascending: true });
  if (error) throw new Error(`listPlotOutputsForRun: ${error.message}`);
  return ((data as unknown as PlotOutputRow[]) ?? []).map(toPlotOutputView);
}

export async function listComparablesForRun(runId: string): Promise<PricingRunComparableView[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('pricing_run_comparables')
    .select(COMP_COLUMNS)
    .eq('pricing_run_id', runId)
    .order('snapshot_closing_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listComparablesForRun: ${error.message}`);
  return ((data as unknown as ComparableRow[]) ?? []).map(toComparableView);
}

/** Pull the full bundle in one read path — convenient for run detail UIs. */
export async function findRunBundle(runId: string): Promise<PricingRunBundleView | null> {
  const run = await findRunById(runId);
  if (!run) return null;
  const [plotOutputs, comparables] = await Promise.all([
    listPlotOutputsForRun(runId),
    listComparablesForRun(runId),
  ]);
  return { run, plotOutputs, comparables };
}

// ────────────────────────────────────────────────────────────────────────────
// Writes — pricing_runs
// ────────────────────────────────────────────────────────────────────────────

export interface InsertRunRow {
  projectId: string;
  version: number;
  mode: PricingRunMode;
  triggerSource: PricingRunTriggerSource;
  triggeredByUserId: string | null;
  compWindowStart: string;
  compWindowEnd: string;
  narrativeSummary?: string | null;
  buyerMigrationThesis?: string | null;
}

export async function insertRun(row: InsertRunRow): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('pricing_runs')
    .insert({
      project_id: row.projectId,
      version: row.version,
      mode: row.mode,
      trigger_source: row.triggerSource,
      triggered_by_user_id: row.triggeredByUserId,
      status: 'draft',
      comp_window_start: row.compWindowStart,
      comp_window_end: row.compWindowEnd,
      narrative_summary: row.narrativeSummary ?? null,
      buyer_migration_thesis: row.buyerMigrationThesis ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`insertRun: ${error.message}`);
  return (data as { id: string }).id;
}

export async function nextRunVersion(projectId: string): Promise<number> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('pricing_runs')
    .select('version')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1);
  if (error) throw new Error(`nextRunVersion: ${error.message}`);
  const rows = (data as Array<{ version: number }> | null) ?? [];
  if (rows.length === 0) return 1;
  return (rows[0]!.version ?? 0) + 1;
}

export async function updateDraftRunHeader(
  runId: string,
  patch: {
    compWindowStart?: string;
    compWindowEnd?: string;
    narrativeSummary?: string | null;
    buyerMigrationThesis?: string | null;
    reconciliationTable?: unknown | null;
  }
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const update: Record<string, unknown> = {};
  if (patch.compWindowStart !== undefined) update.comp_window_start = patch.compWindowStart;
  if (patch.compWindowEnd !== undefined) update.comp_window_end = patch.compWindowEnd;
  if (patch.narrativeSummary !== undefined) update.narrative_summary = patch.narrativeSummary;
  if (patch.buyerMigrationThesis !== undefined)
    update.buyer_migration_thesis = patch.buyerMigrationThesis;
  if (patch.reconciliationTable !== undefined)
    update.reconciliation_table = patch.reconciliationTable;
  if (Object.keys(update).length === 0) return;
  const { error } = await supabase
    .schema('atlas')
    .from('pricing_runs')
    .update(update)
    .eq('id', runId)
    .eq('status', 'draft'); // immutability trigger blocks committed anyway
  if (error) throw new Error(`updateDraftRunHeader: ${error.message}`);
}

export async function commitRunRaw(
  runId: string,
  userId: string,
  reconciliationTable: unknown | null
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .schema('atlas')
    .from('pricing_runs')
    .update({
      status: 'committed',
      committed_at: now,
      committed_by_user_id: userId,
      reconciliation_table: reconciliationTable,
    })
    .eq('id', runId)
    .eq('status', 'draft');
  if (error) throw new Error(`commitRunRaw: ${error.message}`);
}

export async function applyRunRaw(runId: string, userId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .schema('atlas')
    .from('pricing_runs')
    .update({ applied_at: now, applied_by_user_id: userId })
    .eq('id', runId)
    .eq('status', 'committed');
  if (error) throw new Error(`applyRunRaw: ${error.message}`);
}

export async function archiveRunRaw(runId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .schema('atlas')
    .from('pricing_runs')
    .update({ status: 'archived' })
    .eq('id', runId)
    .neq('status', 'archived');
  if (error) throw new Error(`archiveRunRaw: ${error.message}`);
}

// ────────────────────────────────────────────────────────────────────────────
// Writes — pricing_run_comparables (snapshot inserts)
// ────────────────────────────────────────────────────────────────────────────

export interface InsertComparableRow {
  pricingRunId: string;
  compId: string | null;
  snapshotAddress: string;
  snapshotSubCutKey: string;
  snapshotWaterfrontType: string;
  snapshotIsNc: boolean;
  snapshotStatus: string;
  snapshotClosingDate: string | null;
  snapshotSalePriceCents: number | null;
  snapshotAgSqft: number;
  snapshotLotSizeAcres: number | null;
  snapshotYearBuilt: number | null;
  snapshotSourceUrl: string | null;
  snapshotPsf: number | null;
  role: PricingRunCompRole;
  usedForPlotTypeKeys?: string[];
  isPrimaryInSubCut?: boolean;
}

export async function insertRunComparables(
  rows: InsertComparableRow[]
): Promise<PricingRunComparableView[]> {
  if (rows.length === 0) return [];
  const supabase = createSupabaseServerClient();
  const payload = rows.map((r) => ({
    pricing_run_id: r.pricingRunId,
    comp_id: r.compId,
    snapshot_address: r.snapshotAddress,
    snapshot_sub_cut_key: r.snapshotSubCutKey,
    snapshot_waterfront_type: r.snapshotWaterfrontType,
    snapshot_is_nc: r.snapshotIsNc,
    snapshot_status: r.snapshotStatus,
    snapshot_closing_date: r.snapshotClosingDate,
    snapshot_sale_price_cents: r.snapshotSalePriceCents,
    snapshot_ag_sqft: r.snapshotAgSqft,
    snapshot_lot_size_acres: r.snapshotLotSizeAcres,
    snapshot_year_built: r.snapshotYearBuilt,
    snapshot_source_url: r.snapshotSourceUrl,
    snapshot_psf: r.snapshotPsf,
    role: r.role,
    used_for_plot_type_keys: r.usedForPlotTypeKeys ?? [],
    is_primary_in_sub_cut: r.isPrimaryInSubCut ?? false,
  }));
  const { data, error } = await supabase
    .schema('atlas')
    .from('pricing_run_comparables')
    .insert(payload)
    .select(COMP_COLUMNS);
  if (error) throw new Error(`insertRunComparables: ${error.message}`);
  return ((data as unknown as ComparableRow[]) ?? []).map(toComparableView);
}

/** Replace ALL comp snapshots for a draft run. Used during draft edits. */
export async function replaceDraftComparables(
  runId: string,
  rows: InsertComparableRow[]
): Promise<PricingRunComparableView[]> {
  const supabase = createSupabaseServerClient();
  // Guard: never touch a committed run.
  const run = await findRunById(runId);
  if (!run) throw new Error(`replaceDraftComparables: run ${runId} not found`);
  if (run.status !== 'draft') {
    throw new Error(`replaceDraftComparables: run ${runId} is ${run.status}, refusing to mutate`);
  }
  // Plot outputs reference snapshot ids; clear those FKs first to be safe.
  await supabase
    .schema('atlas')
    .from('pricing_run_plot_outputs')
    .update({
      low_anchor_comp_snapshot_id: null,
      base_anchor_comp_snapshot_id: null,
      high_anchor_comp_snapshot_id: null,
    })
    .eq('pricing_run_id', runId);
  const { error: delErr } = await supabase
    .schema('atlas')
    .from('pricing_run_comparables')
    .delete()
    .eq('pricing_run_id', runId);
  if (delErr) throw new Error(`replaceDraftComparables delete: ${delErr.message}`);
  return insertRunComparables(rows);
}

// ────────────────────────────────────────────────────────────────────────────
// Writes — pricing_run_plot_outputs
// ────────────────────────────────────────────────────────────────────────────

export interface InsertPlotOutputRow {
  pricingRunId: string;
  plotTypeKey: string;
  plotTypeLabel: string;
  subCutKey: string;
  plotCount: number;
  sqftPerUnitAg: number;
  lowPsf?: number | null;
  basePsf?: number | null;
  highPsf?: number | null;
  lowAnchorCompSnapshotId?: string | null;
  baseAnchorCompSnapshotId?: string | null;
  highAnchorCompSnapshotId?: string | null;
  lowPremiumPct?: number | null;
  basePremiumPct?: number | null;
  highPremiumPct?: number | null;
  lowDerivation?: PlotDerivation | null;
  baseDerivation?: PlotDerivation | null;
  highDerivation?: PlotDerivation | null;
  dataGapFlag?: boolean | null;
  triangulationReasoning?: string | null;
  classification?: PlotClassification | null;
  confidence?: PlotConfidence | null;
  strongestInSubCutPsf?: number | null;
}

export async function insertPlotOutputs(
  rows: InsertPlotOutputRow[]
): Promise<PricingRunPlotOutputView[]> {
  if (rows.length === 0) return [];
  const supabase = createSupabaseServerClient();
  const payload = rows.map((r) => ({
    pricing_run_id: r.pricingRunId,
    plot_type_key: r.plotTypeKey,
    plot_type_label: r.plotTypeLabel,
    sub_cut_key: r.subCutKey,
    plot_count: r.plotCount,
    sqft_per_unit_ag: r.sqftPerUnitAg,
    low_psf: r.lowPsf ?? null,
    base_psf: r.basePsf ?? null,
    high_psf: r.highPsf ?? null,
    low_anchor_comp_snapshot_id: r.lowAnchorCompSnapshotId ?? null,
    base_anchor_comp_snapshot_id: r.baseAnchorCompSnapshotId ?? null,
    high_anchor_comp_snapshot_id: r.highAnchorCompSnapshotId ?? null,
    low_premium_pct: r.lowPremiumPct ?? null,
    base_premium_pct: r.basePremiumPct ?? null,
    high_premium_pct: r.highPremiumPct ?? null,
    low_derivation: r.lowDerivation ?? null,
    base_derivation: r.baseDerivation ?? null,
    high_derivation: r.highDerivation ?? null,
    data_gap_flag: r.dataGapFlag ?? null,
    triangulation_reasoning: r.triangulationReasoning ?? null,
    classification: r.classification ?? null,
    confidence: r.confidence ?? null,
    strongest_in_sub_cut_psf: r.strongestInSubCutPsf ?? null,
  }));
  const { data, error } = await supabase
    .schema('atlas')
    .from('pricing_run_plot_outputs')
    .insert(payload)
    .select(PLOT_COLUMNS);
  if (error) throw new Error(`insertPlotOutputs: ${error.message}`);
  return ((data as unknown as PlotOutputRow[]) ?? []).map(toPlotOutputView);
}

export interface UpdatePlotOutputPatch {
  lowPsf?: number | null;
  basePsf?: number | null;
  highPsf?: number | null;
  lowAnchorCompSnapshotId?: string | null;
  baseAnchorCompSnapshotId?: string | null;
  highAnchorCompSnapshotId?: string | null;
  triangulationReasoning?: string | null;
  // Engine-only fields — kept here for the commit-time fill path.
  lowPremiumPct?: number | null;
  basePremiumPct?: number | null;
  highPremiumPct?: number | null;
  lowDerivation?: PlotDerivation | null;
  baseDerivation?: PlotDerivation | null;
  highDerivation?: PlotDerivation | null;
  dataGapFlag?: boolean | null;
  classification?: PlotClassification | null;
  confidence?: PlotConfidence | null;
  strongestInSubCutPsf?: number | null;
}

export async function updatePlotOutput(
  plotOutputId: string,
  patch: UpdatePlotOutputPatch
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.lowPsf !== undefined) update.low_psf = patch.lowPsf;
  if (patch.basePsf !== undefined) update.base_psf = patch.basePsf;
  if (patch.highPsf !== undefined) update.high_psf = patch.highPsf;
  if (patch.lowAnchorCompSnapshotId !== undefined)
    update.low_anchor_comp_snapshot_id = patch.lowAnchorCompSnapshotId;
  if (patch.baseAnchorCompSnapshotId !== undefined)
    update.base_anchor_comp_snapshot_id = patch.baseAnchorCompSnapshotId;
  if (patch.highAnchorCompSnapshotId !== undefined)
    update.high_anchor_comp_snapshot_id = patch.highAnchorCompSnapshotId;
  if (patch.triangulationReasoning !== undefined)
    update.triangulation_reasoning = patch.triangulationReasoning;
  if (patch.lowPremiumPct !== undefined) update.low_premium_pct = patch.lowPremiumPct;
  if (patch.basePremiumPct !== undefined) update.base_premium_pct = patch.basePremiumPct;
  if (patch.highPremiumPct !== undefined) update.high_premium_pct = patch.highPremiumPct;
  if (patch.lowDerivation !== undefined) update.low_derivation = patch.lowDerivation;
  if (patch.baseDerivation !== undefined) update.base_derivation = patch.baseDerivation;
  if (patch.highDerivation !== undefined) update.high_derivation = patch.highDerivation;
  if (patch.dataGapFlag !== undefined) update.data_gap_flag = patch.dataGapFlag;
  if (patch.classification !== undefined) update.classification = patch.classification;
  if (patch.confidence !== undefined) update.confidence = patch.confidence;
  if (patch.strongestInSubCutPsf !== undefined)
    update.strongest_in_sub_cut_psf = patch.strongestInSubCutPsf;
  const { error } = await supabase
    .schema('atlas')
    .from('pricing_run_plot_outputs')
    .update(update)
    .eq('id', plotOutputId);
  if (error) throw new Error(`updatePlotOutput: ${error.message}`);
}

// ────────────────────────────────────────────────────────────────────────────
// Project FK update — applied_pricing_run_id
// ────────────────────────────────────────────────────────────────────────────

export async function setProjectAppliedRun(projectId: string, runId: string | null): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .schema('atlas')
    .from('projects')
    .update({ applied_pricing_run_id: runId, updated_at: new Date().toISOString() })
    .eq('id', projectId);
  if (error) throw new Error(`setProjectAppliedRun: ${error.message}`);
}
