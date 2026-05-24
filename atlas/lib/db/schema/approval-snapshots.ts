import { uuid, text, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { atlas } from './atlas-schema';
import { projects } from './projects';

/**
 * Immutable underwriting snapshot. Once `locked_at IS NOT NULL`, the row is
 * frozen — a DB trigger PREVENTS UPDATE (except for appending names to the
 * `approved_by` text[] array, per CLAUDE.md §10 and bundle T022).
 *
 * Lifecycle:
 *   draft  — `locked_at IS NULL`; mutable
 *   locked — `locked_at IS NOT NULL`; immutable. Requires 2nd admin to "approve"
 *            by appending their user id to `approved_by`.
 *
 * `computed_inputs` and `computed_outputs` are opaque JSON blobs — the full
 * frozen snapshot of `runProject()` inputs + outputs at lock time.
 */
export const approvalSnapshots = atlas.table(
  'approval_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    /** Monotonically increasing version per project_id. */
    snapshotVersion: text('snapshot_version').notNull(),
    /** Frozen inputs JSON — opaque per CLAUDE.md §10.5. */
    computedInputs: jsonb('computed_inputs').notNull(),
    /** Frozen outputs JSON — opaque. */
    computedOutputs: jsonb('computed_outputs').notNull(),
    createdBy: uuid('created_by'),
    /** NULL while draft; timestamptz once locked. */
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: uuid('locked_by'),
    /** First approval timestamp (could be same user as lockedBy = bypass). */
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    /** Array of distinct auth.users.id; UI requires len >= 2 for "approved". */
    approvedBy: text('approved_by')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectIdIdx: index('atlas_approval_snapshots_project_id_idx').on(t.projectId),
    projectVersionUnique: uniqueIndex('atlas_approval_snapshots_project_version_unique').on(
      t.projectId,
      t.snapshotVersion
    ),
    lockedAtIdx: index('atlas_approval_snapshots_locked_at_idx').on(t.lockedAt),
  })
);

export type ApprovalSnapshot = typeof approvalSnapshots.$inferSelect;
export type NewApprovalSnapshot = typeof approvalSnapshots.$inferInsert;
