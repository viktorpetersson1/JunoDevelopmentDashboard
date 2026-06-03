import {
  uuid,
  text,
  integer,
  numeric,
  boolean,
  date,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { atlas } from './atlas-schema';

/**
 * V6.2 T118 — Capital Sources versioned ledger.
 *
 * V5.2 (mig 0027) shipped a flat seed shape. V6.2 (mig 0033) extends with:
 *   - covenants (max LTC, max concurrent projects)
 *   - draw windows (optional date range)
 *   - priority ordering (lower drawn first in the funding stack)
 *   - versioning (mirrors atlas.projects — is_current + is_archived + version)
 *
 * Mutations write a NEW row with version+1 and flip the prior is_current=false.
 * Partial unique index enforces "only one current+non-archived row per
 * (source_kind, source_name)" — same pattern as atlas.projects.
 */
export const capitalSources = atlas.table(
  'capital_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // V5.2 columns
    sourceKind: text('source_kind').notNull(), // kpc_loc | project_finance | recycled_equity
    sourceName: text('source_name').notNull(),
    limitUsd: numeric('limit_usd', { precision: 14, scale: 2 }).notNull(),
    drawnUsd: numeric('drawn_usd', { precision: 14, scale: 2 }).notNull().default('0'),
    interestRatePct: numeric('interest_rate_pct', { precision: 5, scale: 3 }),
    notes: text('notes'),

    // V6.2 T118 extras (mig 0033)
    /** Covenant ceiling: total debt outstanding / total project cost ≤ this. Null = no covenant. */
    covenantMaxLtcPct: numeric('covenant_max_ltc_pct', { precision: 5, scale: 3 }),
    /** Max concurrent active-debt projects this source can fund. Null = no covenant. */
    covenantMaxConcurrentProjects: integer('covenant_max_concurrent_projects'),
    /** Earliest month this source can fund a draw (null = no window). */
    drawWindowStartDate: date('draw_window_start_date'),
    /** Latest month a draw is allowed. */
    drawWindowEndDate: date('draw_window_end_date'),
    /** Funding stack order — lower drawn first. */
    priorityOrder: integer('priority_order').notNull().default(0),

    // Versioning model — mirrors atlas.projects
    version: integer('version').notNull().default(1),
    isCurrent: boolean('is_current').notNull().default(true),
    isArchived: boolean('is_archived').notNull().default(false),

    // Audit
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    kindNameCurrentUnique: uniqueIndex('atlas_capital_sources_kind_current_unique')
      .on(t.sourceKind, t.sourceName)
      .where(sql`${t.isCurrent} = true AND ${t.isArchived} = false`),
    priorityIdx: index('atlas_capital_sources_priority_idx').on(t.priorityOrder),
  })
);

export type CapitalSource = typeof capitalSources.$inferSelect;
export type NewCapitalSource = typeof capitalSources.$inferInsert;

/**
 * V6.2 T118 — Per-project capital-source assignments (mig 0034).
 *
 * A project's funding stack is an ordered list of (capital_source_id, priority)
 * pairs. Aggregator (T120) draws from priority 0 first, spills to priority 1
 * when source 0's headroom hits zero, etc.
 *
 * UNIQUE(project_id, capital_source_id) — a source can only appear once per
 * project. Priority is mutable (drag-reorder in the editor — T119).
 */
export const capitalSourceAssignments = atlas.table(
  'capital_source_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull(),
    capitalSourceId: uuid('capital_source_id').notNull(),
    priority: integer('priority').notNull().default(0),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectIdIdx: index('atlas_capital_source_assignments_project_id_idx').on(t.projectId),
    priorityIdx: index('atlas_capital_source_assignments_priority_idx').on(t.projectId, t.priority),
    uniquePair: uniqueIndex('atlas_capital_source_assignments_pair_unique').on(
      t.projectId,
      t.capitalSourceId,
    ),
  })
);

export type CapitalSourceAssignment = typeof capitalSourceAssignments.$inferSelect;
export type NewCapitalSourceAssignment = typeof capitalSourceAssignments.$inferInsert;
