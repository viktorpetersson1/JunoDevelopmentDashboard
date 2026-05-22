import { uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { atlas } from './atlas-schema';

export const orgs = atlas.table('orgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Org = typeof orgs.$inferSelect;
export type NewOrg = typeof orgs.$inferInsert;
