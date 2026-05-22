import { pgSchema } from 'drizzle-orm/pg-core';

// All Atlas tables live in this Postgres schema. See SUPABASE_TRANSLATION.md §3.
export const atlas = pgSchema('atlas');
