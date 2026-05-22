import { pgSchema, pgTable, uuid, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';

// External tables we READ from but do NOT manage migrations for.
// These declarations exist solely for type-safe Drizzle queries.
// drizzle.config.ts schemaFilter:['atlas'] prevents drizzle-kit from
// emitting DDL for these.

const auth = pgSchema('auth');

export const authUsers = auth.table('users', {
  id: uuid('id').primaryKey(),
  email: text('email'),
});

// Vanilla's enum + table. Atlas reads role from here.
// (public is Drizzle's default schema — use pgTable directly, not pgSchema('public'))
export const userRole = pgEnum('user_role', ['super_admin', 'editor', 'viewer_basic', 'viewer']);

export const userProfiles = pgTable('user_profiles', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  role: userRole('role').notNull().default('viewer'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
