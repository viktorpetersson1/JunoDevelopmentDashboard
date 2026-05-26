import { sql } from 'drizzle-orm';
import {
  uuid,
  text,
  integer,
  bigint,
  numeric,
  boolean,
  timestamp,
  date,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { atlas } from './atlas-schema';

/**
 * Exit Pricing Framework v1 — global comp library.
 *
 * One row per real-world comparable property. Pricing runs SNAPSHOT comps
 * at commit time (into `pricing_run_comparables`) so historical runs are
 * immune to later corrections — matches the T063 approval-snapshot
 * immutability pattern.
 *
 * Uniqueness rules (DB-enforced partial uniques, defended at the repo too):
 *   - Closed comps: unique by (address, closing_date). The same property
 *     can sell multiple times — each sale is a separate row.
 *   - Active/pending comps: unique by address only. A property can only
 *     have one live listing at a time.
 *
 * Sub-cut classification (`sub_cut_key`) is human-assigned at ingest time
 * and lives only on the comp row — NOT on the run. The run snapshot
 * captures whatever sub_cut_key the comp had at commit time.
 */
export const comps = atlas.table(
  'comps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    address: text('address').notNull(),
    latitude: numeric('latitude'),
    longitude: numeric('longitude'),
    /** FK-by-convention to markets.sub_cuts[].key — not a DB constraint
     * because sub_cuts is JSONB. Repo validates against the live market
     * config at write time. */
    subCutKey: text('sub_cut_key').notNull(),
    /** Optional water-access tag; can refine the sub_cut. */
    waterfrontType: text('waterfront_type'), // sound_front_bluff | bayfront | inlet | inland
    isNc: boolean('is_nc').notNull(),
    /** closed | active | withdrawn | pending */
    status: text('status').notNull(),
    closingDate: date('closing_date'),
    /** Required for closed; null permitted for active/pending. */
    salePriceCents: bigint('sale_price_cents', { mode: 'number' }),
    agSqft: integer('ag_sqft').notNull(),
    lotSizeAcres: numeric('lot_size_acres'),
    yearBuilt: integer('year_built'),
    broker: text('broker'),
    sourceUrl: text('source_url'),
    /** manual | csv | mls_onekey | compass | outeast | other. v1 = manual/csv only. */
    source: text('source').notNull().default('manual'),
    notes: text('notes'),
    isArchived: boolean('is_archived').notNull().default(false),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    /** Closed comp uniqueness — same address can re-sell, each sale is a row. */
    closedUnique: uniqueIndex('atlas_comps_closed_unique')
      .on(t.address, t.closingDate)
      .where(sql`${t.status} = 'closed'`),
    /** Active/pending uniqueness — one live listing per address. */
    activeUnique: uniqueIndex('atlas_comps_active_unique')
      .on(t.address)
      .where(sql`${t.status} IN ('active', 'pending')`),
    /** Hot path: list comps by sub-cut + status, newest closing first. */
    subCutStatusIdx: index('atlas_comps_sub_cut_status_idx').on(
      t.subCutKey,
      t.status,
      sql`${t.closingDate} DESC`
    ),
    /** Quick narrow on is_nc for "NC-only sub-cut" filtering. */
    isNcIdx: index('atlas_comps_is_nc_idx').on(t.isNc),
    /** Library listing — exclude archived, sort by recency. */
    statusClosingIdx: index('atlas_comps_status_closing_idx')
      .on(t.status, sql`${t.closingDate} DESC`)
      .where(sql`${t.isArchived} = false`),
  })
);

export type Comp = typeof comps.$inferSelect;
export type NewComp = typeof comps.$inferInsert;

export type CompStatus = 'closed' | 'active' | 'withdrawn' | 'pending';
export type CompWaterfrontType = 'sound_front_bluff' | 'bayfront' | 'inlet' | 'inland';
export type CompSource = 'manual' | 'csv' | 'mls_onekey' | 'compass' | 'outeast' | 'other';
