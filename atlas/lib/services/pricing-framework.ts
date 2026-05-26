/**
 * Exit Pricing Framework v1 — service layer.
 *
 * Implements the run lifecycle (createDraftRun → editDraft → commitRun →
 * applyRun → archive) plus the engine logic that classifies committed
 * plot outputs and derives the confidence rating.
 *
 * Engine philosophy (per spec Part 5 + proposal §4):
 *   - The engine does NOT pick L/B/H numbers; humans commit those.
 *   - The engine VALIDATES (mandatory anchors, sub-cut belonging) and
 *     CLASSIFIES (rider / stretch_rider / maker) the human-committed base
 *     against the strongest in-sub-cut anchor.
 *   - The engine also FLAGS data gaps (<3 in-sub-cut closed comps in
 *     window) and derives a coarse confidence rating (high/medium/low)
 *     that the UI surfaces alongside each L/B/H.
 *
 * Open questions resolved at commit 1 (per
 * atlas/docs/backlog/exit-pricing-open-questions.md decisions in proposal):
 *   - Q1: single 'east_end_li' market with three sub-region taxonomies inside.
 *   - Q2: add-during-run UX routes through library; pricing run UI lets you
 *     OPEN the comp form (not implemented here — UI commit). Repo accepts
 *     newly-created comp ids in plot output snapshot lists.
 *   - Q3: Mode 2 creates the draft immediately; human commits sub-cuts via
 *     the editor before the run can transition to `committed`.
 *   - Q4: confidence formula = `confidenceForPlotOutput()` below.
 *   - Q5: per-plot exit fields in ProjectInput — commit 5 work; not here.
 *   - Q6: no approval gate; commit + apply is the gate.
 *   - Q7: comps are global library — `comps` table, one row per real address.
 *   - Q8: each run SNAPSHOTS comps via `pricing_run_comparables`.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { recordMutation } from '@/lib/services/audit';
import { findMarketByKey, getSubCutOrThrow, type MarketView } from '@/lib/repos/markets';
import {
  findClosedCompsInWindow,
  findActiveCompsForSubCuts,
  findCompById,
  type CompView,
} from '@/lib/repos/comps';
import {
  findRunById,
  findRunBundle,
  findLatestCommittedRun,
  insertRun,
  insertPlotOutputs,
  insertRunComparables,
  replaceDraftComparables,
  listComparablesForRun,
  listPlotOutputsForRun,
  nextRunVersion,
  updateDraftRunHeader,
  updatePlotOutput,
  commitRunRaw,
  applyRunRaw,
  archiveRunRaw,
  setProjectAppliedRun,
  type InsertComparableRow,
  type InsertPlotOutputRow,
  type PricingRunBundleView,
  type PricingRunComparableView,
  type PricingRunPlotOutputView,
  type PricingRunView,
} from '@/lib/repos/pricing-framework';
import type {
  PlotClassification,
  PlotConfidence,
  PlotDerivation,
  PricingRunMode,
  PricingRunTriggerSource,
} from '@/lib/db/schema/pricing-runs';
import type { User } from '@supabase/supabase-js';

// ────────────────────────────────────────────────────────────────────────────
// Errors
// ────────────────────────────────────────────────────────────────────────────

export class PricingRunValidationError extends Error {
  readonly code = 'PRICING_RUN_VALIDATION';
  constructor(message: string) {
    super(message);
    this.name = 'PricingRunValidationError';
  }
}

export class PricingRunImmutableError extends Error {
  readonly code = 'PRICING_RUN_IMMUTABLE';
  constructor(message = 'Cannot mutate a committed pricing run') {
    super(message);
    this.name = 'PricingRunImmutableError';
  }
}

export class PricingRunMissingDataError extends Error {
  readonly code = 'PRICING_RUN_MISSING_DATA';
  constructor(message: string) {
    super(message);
    this.name = 'PricingRunMissingDataError';
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Inputs used by the public service surface
// ────────────────────────────────────────────────────────────────────────────

/** One row in projects.plot_types (typed for service convenience). */
export interface PlotTypeSpec {
  key: string;
  label: string;
  count: number;
  sqftPerUnitAg: number;
  /** Sub-cut the plot lives in — required at run creation time. */
  subCutKey: string;
}

export interface CreateDraftRunInput {
  projectId: string;
  marketKey: string; // typically 'east_end_li'
  mode: PricingRunMode;
  triggerSource: PricingRunTriggerSource;
  triggeredByUserId: string | null;
  plotTypes: PlotTypeSpec[];
  /** Optional window override; defaults to `market.defaultCompWindowMonths` ending today. */
  compWindow?: { startDate: string; endDate: string };
}

export interface CommitPlotInput {
  plotOutputId: string;
  lowPsf: number;
  basePsf: number;
  highPsf: number;
  /** Snapshot ids inside `pricing_run_comparables` (NOT raw `comps.id`). */
  lowAnchorCompSnapshotId: string;
  baseAnchorCompSnapshotId: string;
  highAnchorCompSnapshotId: string;
  triangulationReasoning?: string | null;
}

export interface CommitRunInput {
  runId: string;
  plots: CommitPlotInput[];
  narrativeSummary?: string | null;
  buyerMigrationThesis?: string | null;
  /** Engine fills reconciliation_table at commit time from these. */
  reconciliationTable?: unknown | null;
}

// ────────────────────────────────────────────────────────────────────────────
// createDraftRun
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build a fresh draft run. Pulls comps from the global library and snapshots
 * the candidate pool into `pricing_run_comparables` so the human editor sees
 * a stable set even if the live library changes mid-edit.
 *
 * For each plot type:
 *   - Picks all closed in-sub-cut comps within window → snapshot as 'reference'.
 *   - Selects the strongest (max PSF) closed in-sub-cut comp → 'anchor' + isPrimaryInSubCut=true.
 *   - Picks all active/pending in-sub-cut comps → snapshot as 'ceiling'.
 *   - Pre-populates a plot output row with engine-suggested base = strongest anchor PSF.
 */
export async function createDraftRun(input: CreateDraftRunInput): Promise<PricingRunBundleView> {
  // 1. Resolve market + validate sub-cuts.
  const market = await findMarketByKey(input.marketKey);
  if (!market) {
    throw new PricingRunValidationError(`Market '${input.marketKey}' not found`);
  }
  if (input.plotTypes.length === 0) {
    throw new PricingRunValidationError('plotTypes is empty — at least one plot is required');
  }
  for (const p of input.plotTypes) {
    getSubCutOrThrow(market, p.subCutKey); // throws if unknown
    if (p.count <= 0) {
      throw new PricingRunValidationError(`plot '${p.key}' has count ${p.count}; must be > 0`);
    }
    if (p.sqftPerUnitAg <= 0) {
      throw new PricingRunValidationError(
        `plot '${p.key}' has sqftPerUnitAg ${p.sqftPerUnitAg}; must be > 0`
      );
    }
  }

  // 2. Window defaults: today minus N months.
  const today = new Date();
  const start = input.compWindow?.startDate ?? ymd(monthsBack(today, market.defaultCompWindowMonths));
  const end = input.compWindow?.endDate ?? ymd(today);

  // 3. Pull comps once (deduped across plot types' shared sub-cuts).
  const allSubCuts = Array.from(new Set(input.plotTypes.map((p) => p.subCutKey)));
  const [closedComps, activeComps] = await Promise.all([
    findClosedCompsInWindow(allSubCuts, start, end),
    findActiveCompsForSubCuts(allSubCuts),
  ]);

  // 4. Next version + insert run header.
  const version = await nextRunVersion(input.projectId);
  const runId = await insertRun({
    projectId: input.projectId,
    version,
    mode: input.mode,
    triggerSource: input.triggerSource,
    triggeredByUserId: input.triggeredByUserId,
    compWindowStart: start,
    compWindowEnd: end,
  });

  // 5. Snapshot comps into pricing_run_comparables. We assign role:
  //    'anchor' to the single strongest-per-sub-cut closed comp,
  //    'reference' to every other closed comp,
  //    'ceiling' to every active/pending.
  const compSnapshots = buildCompSnapshotRows(runId, closedComps, activeComps, input.plotTypes);
  const insertedSnapshots = await insertRunComparables(compSnapshots);

  // 6. Build a quick lookup: subCutKey → strongest closed snapshot id.
  const strongestByCut = new Map<string, PricingRunComparableView>();
  for (const snap of insertedSnapshots) {
    if (snap.role === 'anchor' && snap.isPrimaryInSubCut) {
      strongestByCut.set(snap.snapshotSubCutKey, snap);
    }
  }

  // 7. Pre-populate plot outputs with engine suggestion (base = strongest anchor PSF).
  const plotRows: InsertPlotOutputRow[] = input.plotTypes.map((p) => {
    const anchor = strongestByCut.get(p.subCutKey);
    const suggestedBase = anchor?.snapshotPsf ?? null;
    const suggestedLow = suggestedBase !== null ? Math.round(suggestedBase * 0.9 * 100) / 100 : null;
    const suggestedHigh = suggestedBase !== null ? Math.round(suggestedBase * 1.1 * 100) / 100 : null;
    return {
      pricingRunId: runId,
      plotTypeKey: p.key,
      plotTypeLabel: p.label,
      subCutKey: p.subCutKey,
      plotCount: p.count,
      sqftPerUnitAg: p.sqftPerUnitAg,
      lowPsf: suggestedLow,
      basePsf: suggestedBase,
      highPsf: suggestedHigh,
      lowAnchorCompSnapshotId: anchor?.id ?? null,
      baseAnchorCompSnapshotId: anchor?.id ?? null,
      highAnchorCompSnapshotId: anchor?.id ?? null,
      // Engine-derived fields stay null until commit.
      dataGapFlag: dataGapForPool(insertedSnapshots, p.subCutKey),
      strongestInSubCutPsf: anchor?.snapshotPsf ?? null,
    };
  });
  await insertPlotOutputs(plotRows);

  await emitAudit(input.triggeredByUserId ?? null, 'pricing_run.create_draft', runId, {
    projectId: input.projectId,
    version,
    plotCount: input.plotTypes.length,
    closedCompCount: closedComps.length,
    activeCompCount: activeComps.length,
  });

  const bundle = await findRunBundle(runId);
  if (!bundle) throw new PricingRunValidationError('Draft created but reload failed');
  return bundle;
}

// ────────────────────────────────────────────────────────────────────────────
// Draft edits
// ────────────────────────────────────────────────────────────────────────────

export interface EditDraftHeaderInput {
  runId: string;
  narrativeSummary?: string | null;
  buyerMigrationThesis?: string | null;
  /** Caller can shift window inside the editor; engine re-snapshots comps if changed. */
  compWindow?: { startDate: string; endDate: string };
}

export async function editDraftHeader(
  input: EditDraftHeaderInput,
  user: User | null
): Promise<PricingRunBundleView> {
  const existing = await findRunById(input.runId);
  if (!existing) throw new PricingRunValidationError(`Run ${input.runId} not found`);
  if (existing.status !== 'draft') {
    throw new PricingRunImmutableError(
      `Run ${input.runId} is ${existing.status}; only drafts can be edited`
    );
  }

  await updateDraftRunHeader(input.runId, {
    narrativeSummary: input.narrativeSummary,
    buyerMigrationThesis: input.buyerMigrationThesis,
    compWindowStart: input.compWindow?.startDate,
    compWindowEnd: input.compWindow?.endDate,
  });

  // If the window changed, re-snapshot the comp pool to keep the editor honest.
  if (
    input.compWindow &&
    (input.compWindow.startDate !== existing.compWindowStart ||
      input.compWindow.endDate !== existing.compWindowEnd)
  ) {
    const plotOutputs = await listPlotOutputsForRun(input.runId);
    const subCuts = Array.from(new Set(plotOutputs.map((p) => p.subCutKey)));
    const [closed, active] = await Promise.all([
      findClosedCompsInWindow(subCuts, input.compWindow.startDate, input.compWindow.endDate),
      findActiveCompsForSubCuts(subCuts),
    ]);
    const fakePlots: PlotTypeSpec[] = plotOutputs.map((p) => ({
      key: p.plotTypeKey,
      label: p.plotTypeLabel,
      count: p.plotCount,
      sqftPerUnitAg: p.sqftPerUnitAg,
      subCutKey: p.subCutKey,
    }));
    const compSnapshots = buildCompSnapshotRows(input.runId, closed, active, fakePlots);
    await replaceDraftComparables(input.runId, compSnapshots);
  }

  await emitAudit(user?.id ?? null, 'pricing_run.edit_draft_header', input.runId, {});

  const bundle = await findRunBundle(input.runId);
  if (!bundle) throw new PricingRunValidationError('Header edit succeeded but reload failed');
  return bundle;
}

// ────────────────────────────────────────────────────────────────────────────
// commitRun — the gate
// ────────────────────────────────────────────────────────────────────────────

/**
 * Validate, classify, and freeze a draft run.
 *
 * Validation rules:
 *   - run must be in draft.
 *   - one CommitPlotInput per plot output (no extras, no missing).
 *   - low ≤ base ≤ high.
 *   - all three anchor ids must reference existing snapshots in this run.
 *   - basePsf > 0.
 *
 * Engine fills (per plot):
 *   - low/base/high_premium_pct  : (psf / anchorPsf - 1) × 100
 *   - low/base/high_derivation   : 'anchored' if anchorPsf > 0, else 'manual'
 *   - data_gap_flag              : <3 closed in-sub-cut snapshots in this run
 *   - classification             : per `classifyBase()` vs strongest-in-sub-cut
 *   - confidence                 : per `confidenceForPlotOutput()`
 *   - strongest_in_sub_cut_psf   : cached for the diff & narrative views
 *
 * Reconciliation table is opaque — the caller (UI) can build whatever JSON
 * structure it wants; we store it as-is and surface it in the history view.
 */
export async function commitRun(
  input: CommitRunInput,
  user: User
): Promise<PricingRunBundleView> {
  const bundle = await findRunBundle(input.runId);
  if (!bundle) throw new PricingRunValidationError(`Run ${input.runId} not found`);
  if (bundle.run.status !== 'draft') {
    throw new PricingRunImmutableError(
      `Run ${input.runId} is ${bundle.run.status}; only drafts can be committed`
    );
  }

  // Index lookups.
  const plotById = new Map(bundle.plotOutputs.map((p) => [p.id, p]));
  const compById = new Map(bundle.comparables.map((c) => [c.id, c]));

  // 1. Coverage: every plot output must be committed.
  if (input.plots.length !== bundle.plotOutputs.length) {
    throw new PricingRunValidationError(
      `commitRun: got ${input.plots.length} plots, expected ${bundle.plotOutputs.length}`
    );
  }
  for (const plot of input.plots) {
    if (!plotById.has(plot.plotOutputId)) {
      throw new PricingRunValidationError(
        `commitRun: plotOutputId ${plot.plotOutputId} does not belong to run ${input.runId}`
      );
    }
  }

  // 2. Resolve market for thresholds (use any plot output's sub_cut → market
  //    via the project's marketId is overkill; for v1 we have a single market
  //    so look up via the project row).
  const market = await resolveMarketForProject(bundle.run.projectId);

  // 3. Validate each plot + assemble engine fills.
  const seenIds = new Set<string>();
  const plotPatches: Array<{ id: string; patch: PlotPatch }> = [];
  for (const submission of input.plots) {
    if (seenIds.has(submission.plotOutputId)) {
      throw new PricingRunValidationError(
        `commitRun: duplicate plotOutputId ${submission.plotOutputId}`
      );
    }
    seenIds.add(submission.plotOutputId);
    const plot = plotById.get(submission.plotOutputId)!;
    validatePlotSubmission(submission, plot, compById);
    const subCutSnapshots = bundle.comparables.filter(
      (c) => c.snapshotSubCutKey === plot.subCutKey
    );
    const closedInSubCut = subCutSnapshots.filter((c) => c.snapshotStatus === 'closed');
    const strongest = closedInSubCut.reduce<PricingRunComparableView | null>(
      (acc, c) => (acc === null || (c.snapshotPsf ?? 0) > (acc.snapshotPsf ?? 0) ? c : acc),
      null
    );
    const strongestPsf = strongest?.snapshotPsf ?? null;

    const anchor = compById.get(submission.baseAnchorCompSnapshotId)!;
    const baseAnchorPsf = anchor.snapshotPsf ?? 0;
    const lowAnchorPsf = compById.get(submission.lowAnchorCompSnapshotId)?.snapshotPsf ?? 0;
    const highAnchorPsf = compById.get(submission.highAnchorCompSnapshotId)?.snapshotPsf ?? 0;

    const dataGap = closedInSubCut.length < 3;
    const classification = classifyBase(
      submission.basePsf,
      strongestPsf,
      market.riderThresholdPct,
      market.stretchThresholdPct
    );
    const confidence = confidenceForPlotOutput({
      basePsf: submission.basePsf,
      strongestInSubCutPsf: strongestPsf,
      closedInSubCutCount: closedInSubCut.length,
      market,
    });

    plotPatches.push({
      id: plot.id,
      patch: {
        lowPsf: submission.lowPsf,
        basePsf: submission.basePsf,
        highPsf: submission.highPsf,
        lowAnchorCompSnapshotId: submission.lowAnchorCompSnapshotId,
        baseAnchorCompSnapshotId: submission.baseAnchorCompSnapshotId,
        highAnchorCompSnapshotId: submission.highAnchorCompSnapshotId,
        triangulationReasoning: submission.triangulationReasoning ?? null,
        lowPremiumPct: premiumPct(submission.lowPsf, lowAnchorPsf),
        basePremiumPct: premiumPct(submission.basePsf, baseAnchorPsf),
        highPremiumPct: premiumPct(submission.highPsf, highAnchorPsf),
        lowDerivation: lowAnchorPsf > 0 ? ('anchored' as PlotDerivation) : ('manual' as PlotDerivation),
        baseDerivation:
          baseAnchorPsf > 0 ? ('anchored' as PlotDerivation) : ('manual' as PlotDerivation),
        highDerivation:
          highAnchorPsf > 0 ? ('anchored' as PlotDerivation) : ('manual' as PlotDerivation),
        dataGapFlag: dataGap,
        classification,
        confidence,
        strongestInSubCutPsf: strongestPsf,
      },
    });
  }

  // 4. Persist patches, then header narrative, then commit transition.
  for (const { id, patch } of plotPatches) {
    await updatePlotOutput(id, patch);
  }
  if (input.narrativeSummary !== undefined || input.buyerMigrationThesis !== undefined) {
    await updateDraftRunHeader(input.runId, {
      narrativeSummary: input.narrativeSummary,
      buyerMigrationThesis: input.buyerMigrationThesis,
    });
  }
  await commitRunRaw(input.runId, user.id, input.reconciliationTable ?? null);

  await emitAudit(user.id, 'pricing_run.commit', input.runId, {
    plotCount: input.plots.length,
  });

  const out = await findRunBundle(input.runId);
  if (!out) throw new PricingRunValidationError('Commit succeeded but reload failed');
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// applyRun + archive
// ────────────────────────────────────────────────────────────────────────────

/**
 * Push a committed run into the financial model. Sets
 * `projects.applied_pricing_run_id`; the calc engine consumes per-plot PSF
 * from this run when it computes exit revenue (commit 5 work).
 *
 * Idempotent: applying the same run twice is a no-op.
 */
export async function applyRun(runId: string, user: User): Promise<PricingRunBundleView> {
  const run = await findRunById(runId);
  if (!run) throw new PricingRunValidationError(`Run ${runId} not found`);
  if (run.status !== 'committed') {
    throw new PricingRunValidationError(`Run ${runId} is ${run.status}; commit it first`);
  }
  await applyRunRaw(runId, user.id);
  await setProjectAppliedRun(run.projectId, runId);

  await emitAudit(user.id, 'pricing_run.apply', runId, { projectId: run.projectId });

  const bundle = await findRunBundle(runId);
  if (!bundle) throw new PricingRunValidationError('Apply succeeded but reload failed');
  return bundle;
}

export async function archiveRun(runId: string, user: User): Promise<void> {
  const run = await findRunById(runId);
  if (!run) throw new PricingRunValidationError(`Run ${runId} not found`);
  if (run.status === 'archived') return;
  await archiveRunRaw(runId);
  await emitAudit(user.id, 'pricing_run.archive', runId, { wasStatus: run.status });
}

// ────────────────────────────────────────────────────────────────────────────
// Engine helpers (pure functions — unit-testable in isolation)
// ────────────────────────────────────────────────────────────────────────────

type PlotPatch = Parameters<typeof updatePlotOutput>[1];

export function classifyBase(
  basePsf: number,
  strongestInSubCutPsf: number | null,
  riderThresholdPct: number,
  stretchThresholdPct: number
): PlotClassification {
  // No anchor → can't classify against sub-cut. Conservative default = 'maker'.
  if (!strongestInSubCutPsf || strongestInSubCutPsf <= 0) return 'maker';
  const premiumPctValue = ((basePsf - strongestInSubCutPsf) / strongestInSubCutPsf) * 100;
  if (premiumPctValue <= riderThresholdPct) return 'rider';
  if (premiumPctValue <= stretchThresholdPct) return 'stretch_rider';
  return 'maker';
}

export interface ConfidenceInput {
  basePsf: number;
  strongestInSubCutPsf: number | null;
  closedInSubCutCount: number;
  market: MarketView;
}

/**
 * Confidence rating per Q4 in
 * `atlas/docs/backlog/exit-pricing-open-questions.md`:
 *
 *   High   : ≥5 closed in-sub-cut comps AND base within ±20% of strongest anchor.
 *   Medium : 3–4 closed in-sub-cut comps, OR ≥5 but base diverges 20–50% from anchor.
 *   Low    : <3 closed in-sub-cut comps (gap-bridged), OR base diverges >50%.
 */
export function confidenceForPlotOutput(input: ConfidenceInput): PlotConfidence {
  const { basePsf, strongestInSubCutPsf, closedInSubCutCount } = input;
  if (closedInSubCutCount < 3) return 'low';
  if (!strongestInSubCutPsf || strongestInSubCutPsf <= 0) return 'low';
  const divergenceAbs = Math.abs((basePsf - strongestInSubCutPsf) / strongestInSubCutPsf) * 100;
  if (divergenceAbs > 50) return 'low';
  if (closedInSubCutCount >= 5 && divergenceAbs <= 20) return 'high';
  return 'medium';
}

function premiumPct(psf: number, anchorPsf: number): number | null {
  if (!anchorPsf || anchorPsf <= 0) return null;
  return Number(((psf - anchorPsf) / anchorPsf * 100).toFixed(4));
}

function validatePlotSubmission(
  submission: CommitPlotInput,
  plot: PricingRunPlotOutputView,
  snapshotById: Map<string, PricingRunComparableView>
): void {
  if (submission.basePsf <= 0) {
    throw new PricingRunValidationError(`plot ${plot.plotTypeKey}: basePsf must be > 0`);
  }
  if (submission.lowPsf <= 0 || submission.highPsf <= 0) {
    throw new PricingRunValidationError(
      `plot ${plot.plotTypeKey}: lowPsf/highPsf must be > 0`
    );
  }
  if (!(submission.lowPsf <= submission.basePsf && submission.basePsf <= submission.highPsf)) {
    throw new PricingRunValidationError(
      `plot ${plot.plotTypeKey}: requires low (${submission.lowPsf}) ≤ base (${submission.basePsf}) ≤ high (${submission.highPsf})`
    );
  }
  const required = [
    submission.lowAnchorCompSnapshotId,
    submission.baseAnchorCompSnapshotId,
    submission.highAnchorCompSnapshotId,
  ];
  for (const id of required) {
    const snap = snapshotById.get(id);
    if (!snap) {
      throw new PricingRunValidationError(
        `plot ${plot.plotTypeKey}: anchor snapshot ${id} does not belong to this run`
      );
    }
    if (snap.snapshotSubCutKey !== plot.subCutKey) {
      throw new PricingRunValidationError(
        `plot ${plot.plotTypeKey}: anchor ${snap.snapshotAddress} is in sub-cut ${snap.snapshotSubCutKey}, expected ${plot.subCutKey}`
      );
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Snapshot construction (createDraft + window-change paths)
// ────────────────────────────────────────────────────────────────────────────

function buildCompSnapshotRows(
  pricingRunId: string,
  closedComps: CompView[],
  activeComps: CompView[],
  plotTypes: PlotTypeSpec[]
): InsertComparableRow[] {
  // Map sub_cut → which plot type keys cite it.
  const subCutToPlotKeys = new Map<string, string[]>();
  for (const p of plotTypes) {
    const arr = subCutToPlotKeys.get(p.subCutKey) ?? [];
    arr.push(p.key);
    subCutToPlotKeys.set(p.subCutKey, arr);
  }

  // Find strongest closed comp per sub-cut.
  const strongestPerCut = new Map<string, CompView>();
  for (const c of closedComps) {
    const cur = strongestPerCut.get(c.subCutKey);
    if (!cur || (c.psf ?? 0) > (cur.psf ?? 0)) {
      strongestPerCut.set(c.subCutKey, c);
    }
  }

  const rows: InsertComparableRow[] = [];

  for (const c of closedComps) {
    const isPrimary = strongestPerCut.get(c.subCutKey)?.id === c.id;
    rows.push({
      pricingRunId,
      compId: c.id,
      snapshotAddress: c.address,
      snapshotSubCutKey: c.subCutKey,
      snapshotWaterfrontType: c.waterfrontType ?? '',
      snapshotIsNc: c.isNc,
      snapshotStatus: c.status,
      snapshotClosingDate: c.closingDate,
      snapshotSalePriceCents: c.salePriceCents,
      snapshotAgSqft: c.agSqft,
      snapshotLotSizeAcres: c.lotSizeAcres,
      snapshotYearBuilt: c.yearBuilt,
      snapshotSourceUrl: c.sourceUrl,
      snapshotPsf: c.psf,
      role: isPrimary ? 'anchor' : 'reference',
      usedForPlotTypeKeys: subCutToPlotKeys.get(c.subCutKey) ?? [],
      isPrimaryInSubCut: isPrimary,
    });
  }

  for (const c of activeComps) {
    rows.push({
      pricingRunId,
      compId: c.id,
      snapshotAddress: c.address,
      snapshotSubCutKey: c.subCutKey,
      snapshotWaterfrontType: c.waterfrontType ?? '',
      snapshotIsNc: c.isNc,
      snapshotStatus: c.status,
      snapshotClosingDate: null,
      snapshotSalePriceCents: c.salePriceCents,
      snapshotAgSqft: c.agSqft,
      snapshotLotSizeAcres: c.lotSizeAcres,
      snapshotYearBuilt: c.yearBuilt,
      snapshotSourceUrl: c.sourceUrl,
      snapshotPsf: c.psf,
      role: 'ceiling',
      usedForPlotTypeKeys: subCutToPlotKeys.get(c.subCutKey) ?? [],
      isPrimaryInSubCut: false,
    });
  }

  return rows;
}

function dataGapForPool(
  snapshots: PricingRunComparableView[],
  subCutKey: string
): boolean {
  return (
    snapshots.filter(
      (s) => s.snapshotStatus === 'closed' && s.snapshotSubCutKey === subCutKey
    ).length < 3
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Project ↔ market lookup
// ────────────────────────────────────────────────────────────────────────────

async function resolveMarketForProject(projectId: string): Promise<MarketView> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('projects')
    .select('market_id')
    .eq('id', projectId)
    .single();
  if (error || !data) {
    throw new PricingRunValidationError(`resolveMarketForProject(${projectId}): lookup failed`);
  }
  const marketId = (data as { market_id: string | null }).market_id ?? 'east_end_li';
  // v1 carries marketId as a string key (legacy), not a UUID. Default to East End.
  const marketKey = marketId === 'default' ? 'east_end_li' : marketId;
  const market = await findMarketByKey(marketKey);
  if (!market) {
    throw new PricingRunValidationError(
      `Market '${marketKey}' (project ${projectId}) not found — seed atlas.markets first`
    );
  }
  return market;
}

// ────────────────────────────────────────────────────────────────────────────
// Convenience reads used by UI + APIs (commit 2-4)
// ────────────────────────────────────────────────────────────────────────────

export async function getLatestCommittedRunForProject(
  projectId: string
): Promise<PricingRunView | null> {
  return findLatestCommittedRun(projectId);
}

/** Look up a global comp (for adding to a draft run mid-edit, Q2 path). */
export async function getCompForDraft(compId: string): Promise<CompView | null> {
  return findCompById(compId);
}

/** Re-list comparables (used by the draft editor's "refresh comp pool" button). */
export async function listSnapshotsForRun(
  runId: string
): Promise<PricingRunComparableView[]> {
  return listComparablesForRun(runId);
}

// ────────────────────────────────────────────────────────────────────────────
// Audit emit (mirrors approval-snapshot service pattern)
// ────────────────────────────────────────────────────────────────────────────

async function emitAudit(
  userId: string | null,
  action: string,
  resourceId: string,
  meta: Record<string, unknown>
): Promise<void> {
  if (!userId) return;
  try {
    const orgId = await resolveOrgId();
    await recordMutation({
      orgId,
      userId,
      route: `service:${action}:${resourceId}`,
      method: 'POST',
      statusCode: 200,
      ip: null,
      userAgent: `atlas-service meta=${JSON.stringify(meta)}`,
    });
  } catch {
    // best-effort
  }
}

let cachedOrgId: string | null = null;
async function resolveOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.schema('atlas').from('orgs').select('id').limit(1).single();
  const id = (data as { id: string } | null)?.id ?? '00000000-0000-0000-0000-000000000000';
  cachedOrgId = id;
  return id;
}

// ────────────────────────────────────────────────────────────────────────────
// Date helpers (no dayjs/luxon — keep it edge-friendly)
// ────────────────────────────────────────────────────────────────────────────

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthsBack(d: Date, months: number): Date {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, d.getUTCDate()));
  return out;
}
