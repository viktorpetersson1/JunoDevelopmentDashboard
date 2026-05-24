import { uuid, text, boolean, integer, timestamp } from 'drizzle-orm/pg-core';
import { atlas } from './atlas-schema';

/**
 * The 7 Juno owners. Identity-table (not versioned per CLAUDE.md §10.3 —
 * versioning lives on cap_table because shares change, names rarely do).
 */
export const owners = atlas.table('owners', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Stable string id used in code + UI (peter, lars, viktor, ...). */
  key: text('key').notNull().unique(),
  displayName: text('display_name').notNull(),
  /** Optional Supabase Auth email (post D-008 invite). */
  email: text('email'),
  isSponsor: boolean('is_sponsor').notNull().default(false),
  isArchived: boolean('is_archived').notNull().default(false),
  /** Tax rate basis points; default 25.5% = 2550. */
  taxRateBps: integer('tax_rate_bps').notNull().default(2550),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Owner = typeof owners.$inferSelect;
export type NewOwner = typeof owners.$inferInsert;
