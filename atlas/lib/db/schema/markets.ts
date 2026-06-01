import { uuid, text, integer, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { atlas } from './atlas-schema';

/**
 * Exit Pricing Framework v1 — market config.
 *
 * v1 seeds ONE row keyed `east_end_li` whose `sub_cuts` JSONB carries the
 * full taxonomy for the three v1 sub-regions (North Fork / Shelter Island /
 * Hamptons family) — answering Q1 in
 * `atlas/docs/backlog/exit-pricing-open-questions.md` as "one umbrella
 * market, three sub-region taxonomies inside".
 *
 * `sub_cuts` shape (opaque per CLAUDE.md §10.5 — engine reads, UI renders):
 *   [
 *     {
 *       key: 'north_fork_sound_front',
 *       label: 'North Fork — Sound-front',
 *       sub_region: 'north_fork',
 *       waterfront_type: 'sound_front_bluff' | 'bayfront' | 'inlet' | 'inland',
 *       is_nc_only: boolean,
 *       order: number
 *     },
 *     …
 *   ]
 *
 * `rider_threshold_pct` and `stretch_threshold_pct` are the engine cutoffs
 * for classifying a committed base PSF vs. the strongest in-sub-cut anchor:
 *   - ≤ rider_threshold_pct (default 15) → 'rider'
 *   - ≤ stretch_threshold_pct (default 30) → 'stretch_rider'
 *   - >  stretch_threshold_pct → 'maker'
 */
export const markets = atlas.table('markets', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Stable URL slug; e.g. 'east_end_li'. */
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  defaultCompWindowMonths: integer('default_comp_window_months').notNull().default(24),
  riderThresholdPct: integer('rider_threshold_pct').notNull().default(15),
  stretchThresholdPct: integer('stretch_threshold_pct').notNull().default(30),
  /** Opaque sub-cut taxonomy — see file header. */
  subCuts: jsonb('sub_cuts')
    .notNull()
    .default(sql`'[]'::jsonb`),
  /** Reserved for v2 cross-market migration thesis ("Manhattan buyers
   * migrating to North Fork"). v1 leaves empty. */
  referenceMarketIds: uuid('reference_market_ids')
    .array()
    .notNull()
    .default(sql`ARRAY[]::uuid[]`),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Market = typeof markets.$inferSelect;
export type NewMarket = typeof markets.$inferInsert;

/**
 * Shape stored in `markets.sub_cuts`. Engine and UI both deserialize via
 * this type — no schema constraint, but every row Atlas writes goes
 * through this contract.
 */
export interface MarketSubCut {
  key: string;
  label: string;
  sub_region: 'north_fork' | 'shelter_island' | 'hamptons';
  /** Optional, helps narrow comps when the sub-cut implies water access. */
  waterfront_type?: 'sound_front_bluff' | 'bayfront' | 'inlet' | 'inland';
  /** True ⇒ only NC (new construction) comps belong in this sub-cut. */
  is_nc_only?: boolean;
  /** Stable display order in the editor and history views. */
  order: number;
}
