import { sql } from 'drizzle-orm';
import {
  uuid,
  text,
  integer,
  bigint,
  numeric,
  boolean,
  jsonb,
  timestamp,
  date,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { atlas } from './atlas-schema';
import { projects } from './projects';
import { comps } from './comps';

// ────────────────────────────────────────────────────────────────────────────
// Exit Pricing Framework v1 — replaces the old (empty, never shipped) hedonic
// `pricing_runs` + `pricing_run_comparables` schema dropped in migration
// `drop_legacy_hedonic_pricing_tables`. See:
//   - atlas/docs/backlog/exit-pricing-framework-v1.md (spec)
//   - atlas/docs/backlog/exit-pricing-proposal-v1.md (proposal + decisions)
//   - atlas/docs/backlog/exit-pricing-open-questions.md (carry-over Qs)
//
// Three tables work together:
//   pricing_runs              — header per project per version (draft/committed/archived)
//   pricing_run_plot_outputs  — human-committed L/B/H per plot type + engine classification
//   pricing_run_comparables   — snapshot of comps cited by the run (immutable once committed)
//
// Immutability invariant — `committed` runs are frozen on the DB side by the
// trigger `atlas.enforce_pricing_run_immutability` (only `applied_*` fields
// + `status` transition to `archived` are mutable post-commit).
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pricing run header. One row per (project, version). Multiple drafts per
 * project are allowed at any time but only one is "applied" at a time
 * (`projects.applied_pricing_run_id` points at the live one).
 *
 * Lifecycle:
 *   draft → committed → (optionally) applied → eventually archived
 *
 *   - draft     : engine has classified preview values; human still editing.
 *                 Plot outputs and comp snapshots are mutable.
 *   - committed : human has signed off. Engine snapshot frozen. Numbers locked.
 *   - applied   : `projects.applied_pricing_run_id = this.id`. Calc engine
 *                 reads PSF from this run's plot outputs.
 *   - archived  : superseded. Kept for history.
 */
export const pricingRuns = atlas.table(
  'pricing_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    /** Monotonic per project_id. v1, v2, v3… */
    version: integer('version').notNull(),
    /** auto = Mode 2 (project create), on_demand = Mode 3 (manual re-run),
     * screening = Mode 1 (pre-acquisition; deferred in v1 but reserved). */
    mode: text('mode').notNull(),
    /** system | user — who initiated the run. */
    triggerSource: text('trigger_source').notNull(),
    triggeredByUserId: uuid('triggered_by_user_id'),
    /** draft | committed | archived */
    status: text('status').notNull().default('draft'),
    /** Comp window bracket; engine pulls only comps with closing_date in
     * [start, end] (or active/pending status, unbracketed). */
    compWindowStart: date('comp_window_start').notNull(),
    compWindowEnd: date('comp_window_end').notNull(),
    /** Human narrative captured at commit time; surfaces in history view. */
    narrativeSummary: text('narrative_summary'),
    /** Optional Manhattan→East-End thesis blurb for v1 East End market. */
    buyerMigrationThesis: text('buyer_migration_thesis'),
    /** Opaque per §10.5 — engine's reconciliation table: comp-by-comp
     * adjustments, premia/discounts, gap-bridge math. UI renders. */
    reconciliationTable: jsonb('reconciliation_table'),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    appliedByUserId: uuid('applied_by_user_id'),
    committedAt: timestamp('committed_at', { withTimezone: true }),
    committedByUserId: uuid('committed_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectVersionUnique: uniqueIndex('atlas_pricing_runs_project_version_unique').on(
      t.projectId,
      t.version
    ),
    projectIdx: index('atlas_pricing_runs_project_idx').on(
      t.projectId,
      sql`${t.createdAt} DESC`
    ),
    statusIdx: index('atlas_pricing_runs_status_idx').on(t.status),
  })
);

/**
 * Snapshot of a single comp as it appeared at run-commit time. Frozen forever
 * after commit — any future correction to the live `comps` row does NOT
 * propagate back. Matches the T063 approval-snapshot pattern.
 *
 * `comp_id` is the soft pointer back to the source `comps` row (nullable
 * because a comp can be hard-deleted and we still want to keep the snapshot).
 *
 * `role` describes how the comp was used in this run:
 *   - anchor    : the strongest closed sale that the base PSF triangulates from.
 *   - reference : a non-anchor closed sale informing the L/B/H math.
 *   - ceiling   : an active/pending listing capping the high band.
 *   - floor     : an active/pending listing floor (rarely used).
 *   - context   : included for narrative completeness, not used in math.
 */
export const pricingRunComparables = atlas.table(
  'pricing_run_comparables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pricingRunId: uuid('pricing_run_id')
      .notNull()
      .references(() => pricingRuns.id, { onDelete: 'restrict' }),
    compId: uuid('comp_id').references(() => comps.id, { onDelete: 'set null' }),
    snapshotAddress: text('snapshot_address').notNull(),
    snapshotSubCutKey: text('snapshot_sub_cut_key').notNull(),
    snapshotWaterfrontType: text('snapshot_waterfront_type').notNull(),
    snapshotIsNc: boolean('snapshot_is_nc').notNull(),
    snapshotStatus: text('snapshot_status').notNull(),
    snapshotClosingDate: date('snapshot_closing_date'),
    snapshotSalePriceCents: bigint('snapshot_sale_price_cents', { mode: 'number' }),
    snapshotAgSqft: integer('snapshot_ag_sqft').notNull(),
    snapshotLotSizeAcres: numeric('snapshot_lot_size_acres'),
    snapshotYearBuilt: integer('snapshot_year_built'),
    snapshotSourceUrl: text('snapshot_source_url'),
    /** Pre-computed PSF for convenience (sale_price_cents / 100 / ag_sqft). */
    snapshotPsf: numeric('snapshot_psf'),
    /** anchor | reference | ceiling | floor | context */
    role: text('role').notNull(),
    /** Multi-plot-type runs: which plot types cited this comp? Empty = unused. */
    usedForPlotTypeKeys: text('used_for_plot_type_keys')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    /** Marked by engine: the strongest in-sub-cut anchor used for classification. */
    isPrimaryInSubCut: boolean('is_primary_in_sub_cut').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    runIdx: index('atlas_pricing_run_comparables_run_idx').on(t.pricingRunId),
    runSubCutIdx: index('atlas_pricing_run_comparables_sub_cut_idx').on(
      t.pricingRunId,
      t.snapshotSubCutKey
    ),
  })
);

/**
 * Per-plot-type output. One row per plot type per run, with the human-
 * committed L/B/H PSF values and engine-derived classification + confidence.
 *
 * Human commits:
 *   low_psf, base_psf, high_psf
 *   low/base/high_anchor_comp_snapshot_id  (FK into pricing_run_comparables)
 *   triangulation_reasoning  (free-text "why these comps support these numbers")
 *
 * Engine fills at commit time:
 *   low/base/high_premium_pct  (PSF / anchor_psf - 1, in percentage points)
 *   low/base/high_derivation   (gap-bridged | anchored | extrapolated | …)
 *   data_gap_flag              (<3 closed in-sub-cut comps in window)
 *   classification             (rider | stretch_rider | maker — vs strongest anchor)
 *   confidence                 (high | medium | low — comp density + anchor strength)
 *   strongest_in_sub_cut_psf   (cached for narrative + diff)
 */
export const pricingRunPlotOutputs = atlas.table(
  'pricing_run_plot_outputs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pricingRunId: uuid('pricing_run_id')
      .notNull()
      .references(() => pricingRuns.id, { onDelete: 'restrict' }),
    /** Stable per-project plot key (e.g. 'sound_front_villa', 'inland_villa'). */
    plotTypeKey: text('plot_type_key').notNull(),
    plotTypeLabel: text('plot_type_label').notNull(),
    /** FK-by-convention to markets.sub_cuts[].key. */
    subCutKey: text('sub_cut_key').notNull(),
    plotCount: integer('plot_count').notNull().default(1),
    sqftPerUnitAg: integer('sqft_per_unit_ag').notNull(),
    // ── Human-committed L/B/H ───────────────────────────────────────────────
    lowPsf: numeric('low_psf'),
    basePsf: numeric('base_psf'),
    highPsf: numeric('high_psf'),
    lowAnchorCompSnapshotId: uuid('low_anchor_comp_snapshot_id').references(
      () => pricingRunComparables.id,
      { onDelete: 'set null' }
    ),
    baseAnchorCompSnapshotId: uuid('base_anchor_comp_snapshot_id').references(
      () => pricingRunComparables.id,
      { onDelete: 'set null' }
    ),
    highAnchorCompSnapshotId: uuid('high_anchor_comp_snapshot_id').references(
      () => pricingRunComparables.id,
      { onDelete: 'set null' }
    ),
    // ── Engine-derived at commit ────────────────────────────────────────────
    lowPremiumPct: numeric('low_premium_pct'),
    basePremiumPct: numeric('base_premium_pct'),
    highPremiumPct: numeric('high_premium_pct'),
    lowDerivation: text('low_derivation'),
    baseDerivation: text('base_derivation'),
    highDerivation: text('high_derivation'),
    dataGapFlag: boolean('data_gap_flag'),
    triangulationReasoning: text('triangulation_reasoning'),
    /** rider | stretch_rider | maker (per spec Part 5 classification). */
    classification: text('classification'),
    /** high | medium | low — derived from comp density and anchor strength. */
    confidence: text('confidence'),
    strongestInSubCutPsf: numeric('strongest_in_sub_cut_psf'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    runPlotTypeUnique: uniqueIndex(
      'atlas_pricing_run_plot_outputs_run_plot_unique'
    ).on(t.pricingRunId, t.plotTypeKey),
    runIdx: index('atlas_pricing_plot_outputs_run_idx').on(t.pricingRunId),
  })
);

// ────────────────────────────────────────────────────────────────────────────
// Types & enums
// ────────────────────────────────────────────────────────────────────────────

export type PricingRun = typeof pricingRuns.$inferSelect;
export type NewPricingRun = typeof pricingRuns.$inferInsert;

export type PricingRunComparable = typeof pricingRunComparables.$inferSelect;
export type NewPricingRunComparable = typeof pricingRunComparables.$inferInsert;

export type PricingRunPlotOutput = typeof pricingRunPlotOutputs.$inferSelect;
export type NewPricingRunPlotOutput = typeof pricingRunPlotOutputs.$inferInsert;

export type PricingRunMode = 'auto' | 'on_demand' | 'screening';
export type PricingRunStatus = 'draft' | 'committed' | 'archived';
export type PricingRunTriggerSource = 'system' | 'user';
export type PricingRunCompRole = 'anchor' | 'reference' | 'ceiling' | 'floor' | 'context';
export type PlotClassification = 'rider' | 'stretch_rider' | 'maker';
export type PlotConfidence = 'high' | 'medium' | 'low';
export type PlotDerivation = 'gap_bridged' | 'anchored' | 'extrapolated' | 'manual';
