import { sql } from 'drizzle-orm';
import {
  uuid,
  text,
  integer,
  bigint,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { atlas } from './atlas-schema';

/**
 * Project — the core entity. VERSIONED per CLAUDE.md §10.3.
 *
 * Each edit writes a new row (incremented `version`) and flips the prior row's
 * `is_current=false`. Only ONE row per `project_key` may be `is_current=true`
 * at a time (enforced via partial unique index).
 *
 * Money is stored as bigint cents. Percentages are stored as basis-points
 * integers (75% = 7500). Dates are YYYY-MM strings for the project-grid (Excel
 * convention; safer than timestamptz for month-only inputs).
 */
export const projects = atlas.table(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stable identity across versions, e.g. "84sbr", "horizon". */
    projectKey: text('project_key').notNull(),
    version: integer('version').notNull().default(1),
    isCurrent: boolean('is_current').notNull().default(true),
    isArchived: boolean('is_archived').notNull().default(false),

    // ── Identity ─────────────────────────────────────────────────────────
    name: text('name').notNull(),
    address: text('address'),
    googleMapsUrl: text('google_maps_url'),
    entitySpv: text('entity_spv'),

    // ── Taxonomy (soft FKs; markets live in app config for now) ──────────
    marketId: text('market_id').notNull().default('default'),
    assetType: text('asset_type').notNull(),
    status: text('status').notNull(),
    stage: text('stage').notNull(),

    // ── Program ──────────────────────────────────────────────────────────
    /** YYYY-MM (month-only is sufficient for the cash-flow grid). */
    purchaseDate: text('purchase_date'),
    sourcingMonths: integer('sourcing_months').notNull().default(0),
    permittingPreconstructionMonths: integer('permitting_preconstruction_months')
      .notNull()
      .default(0),
    constructionMonths: integer('construction_months').notNull().default(0),
    salesMonths: integer('sales_months').notNull().default(0),
    villaSqftAg: integer('villa_sqft_ag').notNull().default(0),
    villaSqftBg: integer('villa_sqft_bg').notNull().default(0),

    // ── Costs (bigint cents; nulls mean "use global default") ────────────
    landCostCents: bigint('land_cost_cents', { mode: 'number' }).notNull().default(0),
    buildCostPerSqftCents: bigint('build_cost_per_sqft_cents', { mode: 'number' }),
    softCostsLumpSumCents: bigint('soft_costs_lump_sum_cents', { mode: 'number' })
      .notNull()
      .default(0),
    /** Opaque per CLAUDE.md §10.5 — not queryable filter. */
    softCostsBreakdown: jsonb('soft_costs_breakdown'),

    // ── Financing ────────────────────────────────────────────────────────
    lenderName: text('lender_name'),
    /** Basis points; 75% = 7500. */
    seniorLtvBps: integer('senior_ltv_bps').notNull().default(7500),
    /** Null = use globals.interest_rate_apr. */
    interestRateBps: integer('interest_rate_bps'),
    /** Null = use globals.contingency_pct. */
    contingencyBps: integer('contingency_bps'),
    originationFeeBps: integer('origination_fee_bps').notNull().default(100),
    exitFeeBps: integer('exit_fee_bps').notNull().default(50),
    interestReserveCents: bigint('interest_reserve_cents', { mode: 'number' }).notNull().default(0),
    loanServicingFeeCents: bigint('loan_servicing_fee_cents', { mode: 'number' })
      .notNull()
      .default(0),
    closingCostsCents: bigint('closing_costs_cents', { mode: 'number' }).notNull().default(0),
    /** Array of {description, amount_cents}. Opaque per §10.5. */
    otherFees: jsonb('other_fees'),

    // ── Revenue overrides ────────────────────────────────────────────────
    salePriceOverrideCents: bigint('sale_price_override_cents', { mode: 'number' }),
    salePricePerSqftOverrideCents: bigint('sale_price_per_sqft_override_cents', {
      mode: 'number',
    }),
    targetMarginBps: integer('target_margin_bps'),

    // ── Sales lifecycle ──────────────────────────────────────────────────
    /** YYYY-MM-DD strings (date-only sufficient). */
    listingDate: text('listing_date'),
    underContractDate: text('under_contract_date'),
    closingDate: text('closing_date'),
    listingPriceCents: bigint('listing_price_cents', { mode: 'number' }),
    actualSalePriceCents: bigint('actual_sale_price_cents', { mode: 'number' }),

    // ── Build curve override ─────────────────────────────────────────────
    /** 'linear' | 'front_loaded' | 's_curve'; null = use global. */
    buildCostCurve: text('build_cost_curve'),

    // ── Exit Pricing Framework v1 (D-016) ────────────────────────────────
    /**
     * Multi-plot-type config for a project. NULL = single-villa back-compat
     * (the 10 baseline projects all have NULL).
     *
     * Shape (opaque per §10.5):
     *   [
     *     {
     *       key: 'sound_front_villa',
     *       label: 'Sound-front villa',
     *       count: 1,
     *       sqft_per_unit_ag: 4200,
     *       sale_price_per_sqft_override_cents?: number,
     *       applied_pricing_run_id?: string
     *     },
     *     …
     *   ]
     */
    plotTypes: jsonb('plot_types'),
    /**
     * Soft pointer to the pricing run currently driving exit PSF in the
     * calc engine. NULL = no framework run applied (calc engine falls back
     * to sale_price_override_cents / cost-plus-margin). FK is enforced
     * by the DB migration; not declared here to avoid Drizzle circular
     * import with pricingRuns.
     */
    appliedPricingRunId: uuid('applied_pricing_run_id'),

    // ── Audit ────────────────────────────────────────────────────────────
    /** auth.users.id; FK declared via raw SQL in migration. */
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    keyVersionUnique: uniqueIndex('atlas_projects_key_version_unique').on(t.projectKey, t.version),
    /** Partial unique: only one current+non-archived row per project_key. */
    currentUnique: uniqueIndex('atlas_projects_current_unique')
      .on(t.projectKey)
      .where(sql`${t.isCurrent} = true AND ${t.isArchived} = false`),
    stageIdx: index('atlas_projects_stage_idx').on(t.stage),
    statusIdx: index('atlas_projects_status_idx').on(t.status),
  })
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

/**
 * Shape stored in `projects.plot_types`. Reconciles to
 * `pricing_run_plot_outputs` rows when a pricing run is applied.
 *
 * Per-plot override PSF defeats the framework — used as an escape hatch
 * for legacy projects with hand-set exits; engine reads
 * sale_price_per_sqft_override_cents per plot, NOT the framework run.
 */
export interface ProjectPlotType {
  key: string;
  label: string;
  count: number;
  sqft_per_unit_ag: number;
  sale_price_per_sqft_override_cents?: number | null;
  applied_pricing_run_id?: string | null;
}
