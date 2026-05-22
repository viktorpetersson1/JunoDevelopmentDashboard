import { sql } from 'drizzle-orm';
import { uuid, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { atlas } from './atlas-schema';
import { orgs } from './orgs';

// Atlas mutation audit trail. Distinct from public.activity_log (vanilla's UI trail).
// One row per mutating API request (POST/PATCH/DELETE/PUT). See T012.
export const auditLog = atlas.table(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'restrict' }),
    // user_id references auth.users(id). Declared via raw SQL in the migration
    // because auth.users is outside Drizzle's managed schema set.
    userId: uuid('user_id'),
    route: text('route').notNull(),
    method: text('method').notNull(),
    statusCode: integer('status_code').notNull(),
    beforeJson: jsonb('before_json'),
    afterJson: jsonb('after_json'),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdIdx: index('atlas_audit_log_org_id_idx').on(t.orgId),
    userIdIdx: index('atlas_audit_log_user_id_idx').on(t.userId),
    createdAtIdx: index('atlas_audit_log_created_at_idx').on(sql`${t.createdAt} DESC`),
  })
);

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
