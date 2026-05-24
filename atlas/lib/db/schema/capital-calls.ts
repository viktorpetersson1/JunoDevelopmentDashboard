import { sql } from 'drizzle-orm';
import {
  uuid,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  date,
} from 'drizzle-orm/pg-core';
import { atlas } from './atlas-schema';
import { owners } from './owners';
import { projects } from './projects';

/**
 * Capital call against a project. Issuing a call freezes its owner-shares
 * (in `capital_call_owner_shares`). Owners "commit" to their share, then
 * actually wire money (recorded in `capital_call_payments`).
 *
 * Lifecycle: draft -> issued -> partial -> funded
 *
 * Per CLAUDE.md §10.3 capital_calls are NOT versioned — they're immutable
 * events. Cancelling a call sets `is_archived = true`.
 */
export const capitalCalls = atlas.table(
  'capital_calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    /** draft | issued | partial | funded | cancelled */
    status: text('status').notNull().default('draft'),
    /** Reference number for human readability, e.g. CC-2026-001. */
    callNumber: text('call_number').notNull(),
    totalAmountCents: bigint('total_amount_cents', { mode: 'number' }).notNull(),
    /** Date the call was formally issued to owners. */
    issuedDate: date('issued_date'),
    /** Date by which owners are expected to fund their share. */
    dueDate: date('due_date'),
    notes: text('notes'),
    isArchived: boolean('is_archived').notNull().default(false),

    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectIdIdx: index('atlas_capital_calls_project_id_idx').on(t.projectId),
    statusIdx: index('atlas_capital_calls_status_idx').on(t.status),
    callNumberUnique: uniqueIndex('atlas_capital_calls_call_number_unique').on(t.callNumber),
  })
);

/**
 * Per-owner share of a capital call. Frozen at issuance — the values stored
 * here are the contractual amounts each owner owes for this call.
 *
 * DB invariant (trigger): sum of share_amount_cents for one capital_call_id
 * equals capital_calls.total_amount_cents.
 */
export const capitalCallOwnerShares = atlas.table(
  'capital_call_owner_shares',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    capitalCallId: uuid('capital_call_id')
      .notNull()
      .references(() => capitalCalls.id, { onDelete: 'restrict' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => owners.id, { onDelete: 'restrict' }),
    /** Share at the moment of issuance, as basis points (3800 = 38.0%). */
    shareBpsAtIssuance: integer('share_bps_at_issuance').notNull(),
    shareAmountCents: bigint('share_amount_cents', { mode: 'number' }).notNull(),
    /** pending | committed | funded */
    status: text('status').notNull().default('pending'),
    /** Optional override note (e.g. "Lars pre-paid via separate wire"). */
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    callIdIdx: index('atlas_cc_shares_call_id_idx').on(t.capitalCallId),
    ownerIdIdx: index('atlas_cc_shares_owner_id_idx').on(t.ownerId),
    callOwnerUnique: uniqueIndex('atlas_cc_shares_call_owner_unique').on(
      t.capitalCallId,
      t.ownerId
    ),
  })
);

/**
 * A single payment recording money actually received. Multiple partial
 * payments per owner-share are allowed (e.g. wire arrives in two parts).
 */
export const capitalCallPayments = atlas.table(
  'capital_call_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerShareId: uuid('owner_share_id')
      .notNull()
      .references(() => capitalCallOwnerShares.id, { onDelete: 'restrict' }),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    receivedDate: date('received_date').notNull(),
    method: text('method'),
    referenceNumber: text('reference_number'),
    notes: text('notes'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerShareIdIdx: index('atlas_cc_payments_share_id_idx').on(t.ownerShareId),
    receivedDateIdx: index('atlas_cc_payments_received_date_idx').on(sql`${t.receivedDate} DESC`),
  })
);

export type CapitalCall = typeof capitalCalls.$inferSelect;
export type NewCapitalCall = typeof capitalCalls.$inferInsert;
export type CapitalCallOwnerShare = typeof capitalCallOwnerShares.$inferSelect;
export type NewCapitalCallOwnerShare = typeof capitalCallOwnerShares.$inferInsert;
export type CapitalCallPayment = typeof capitalCallPayments.$inferSelect;
export type NewCapitalCallPayment = typeof capitalCallPayments.$inferInsert;
