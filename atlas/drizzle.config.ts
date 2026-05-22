import { defineConfig } from 'drizzle-kit';

// Drizzle config for the atlas schema only. The vanilla app's public.* tables
// are NOT managed here. See docs/handoff/SUPABASE_TRANSLATION.md §3.
export default defineConfig({
  schema: './lib/db/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  schemaFilter: ['atlas'],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
});
