import { sql } from 'drizzle-orm';
import { uuid, integer, date, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { atlas } from './atlas-schema';
import { owners } from './owners';

/**
 * Per-owner cap-table share, basis points (100 bps = 1%).
 * Historical: each share change inserts a new row + flips the prior is_current=false.
 * DB-level invariant: sum of current shares = 10000 (enforced via deferrable trigger).
 */
export const capTable = atlas.table(
  'cap_table',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => owners.id, { onDelete: 'restrict' }),
    /** Basis points. Peter 38.0% = 3800; Mark 2.5% = 250. */
    shareBps: integer('share_bps').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    /** NULL when this row is the active share for the owner. */
    effectiveTo: date('effective_to'),
    isCurrent: boolean('is_current').notNull().default(true),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdIdx: index('atlas_cap_table_owner_id_idx').on(t.ownerId),
    currentIdx: index('atlas_cap_table_current_idx')
      .on(t.ownerId)
      .where(sql`${t.isCurrent} = true`),
  })
);

export type CapTableEntry = typeof capTable.$inferSelect;
export type NewCapTableEntry = typeof capTable.$inferInsert;
