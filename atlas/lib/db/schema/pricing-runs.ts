import {
  uuid,
  text,
  integer,
  bigint,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  date,
} from 'drizzle-orm/pg-core';
import { atlas } from './atlas-schema';
import { projects } from './projects';

/**
 * Pricing run — per-project hedonic-model output. Read-only in P0; writes
 * come in W1.7 (pricing engine ticket sequence). Schema is provisioned now
 * so the UI surfaces (Project pricing tab, Performance page) can read
 * deterministically once data exists.
 *
 * Each project has zero or more pricing runs; the most-recent non-archived
 * run is the "current" valuation (UI filters by run_date DESC).
 */
export const pricingRuns = atlas.table(
  'pricing_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    runDate: date('run_date').notNull(),
    /** Versioned model identifier, e.g. "hedonic-v1.2.0". */
    modelVersion: text('model_version').notNull(),
    estimatedValueCents: bigint('estimated_value_cents', { mode: 'number' }).notNull(),
    /** 80% confidence interval — engine-defined; surface displays ± band. */
    confidenceLowCents: bigint('confidence_low_cents', { mode: 'number' }),
    confidenceHighCents: bigint('confidence_high_cents', { mode: 'number' }),
    /** Opaque snapshot of model inputs (feature vector + market context). */
    inputsJson: jsonb('inputs_json'),
    /** Opaque snapshot of model outputs (per-feature contribution, etc.). */
    outputsJson: jsonb('outputs_json'),
    notes: text('notes'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectIdIdx: index('atlas_pricing_runs_project_id_idx').on(t.projectId),
    projectRunDateUnique: uniqueIndex('atlas_pricing_runs_project_run_date_unique').on(
      t.projectId,
      t.runDate,
      t.modelVersion
    ),
  })
);

/**
 * Comparable property cited by a pricing run. Multiple comps per run (~5-15
 * typical). Stored normalized so the UI can list them in a table sorted by
 * similarity / distance / recency.
 */
export const pricingRunComparables = atlas.table(
  'pricing_run_comparables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pricingRunId: uuid('pricing_run_id')
      .notNull()
      .references(() => pricingRuns.id, { onDelete: 'restrict' }),
    compAddress: text('comp_address').notNull(),
    compSalePriceCents: bigint('comp_sale_price_cents', { mode: 'number' }).notNull(),
    compSaleDate: date('comp_sale_date'),
    sqft: integer('sqft'),
    beds: integer('beds'),
    baths: integer('baths'),
    /** Distance from the subject property, in miles × 100 (e.g. 0.42mi = 42). */
    distanceCentimiles: integer('distance_centimiles'),
    /** 0–10000 similarity score basis points (10000 = perfect match). */
    similarityBps: integer('similarity_bps'),
    sourceUrl: text('source_url'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pricingRunIdIdx: index('atlas_pricing_run_comps_run_id_idx').on(t.pricingRunId),
    similarityIdx: index('atlas_pricing_run_comps_similarity_idx').on(t.similarityBps),
  })
);

export type PricingRun = typeof pricingRuns.$inferSelect;
export type NewPricingRun = typeof pricingRuns.$inferInsert;
export type PricingRunComparable = typeof pricingRunComparables.$inferSelect;
export type NewPricingRunComparable = typeof pricingRunComparables.$inferInsert;
