import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

type AtlasDb = PostgresJsDatabase<typeof schema>;

let cachedDb: AtlasDb | null = null;
let cachedClient: ReturnType<typeof postgres> | null = null;

/**
 * Lazy Drizzle client for the Atlas Postgres connection.
 *
 * - Reads DATABASE_URL at first call (not at import) so missing env in dev
 *   doesn't crash module imports.
 * - Use Supabase's transaction-mode pooler URL (port 6543) — Drizzle's
 *   `prepare: false` is required for compat.
 */
export function getDb(): AtlasDb {
  if (cachedDb) return cachedDb;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Configure it in .env.local (Supabase Dashboard → Project Settings → Database → Connection string, transaction pooler).'
    );
  }

  cachedClient = postgres(url, { prepare: false });
  cachedDb = drizzle(cachedClient, { schema });
  return cachedDb;
}

/** For tests + scripts that need to close the connection cleanly. */
export async function closeDb(): Promise<void> {
  if (cachedClient) {
    await cachedClient.end();
    cachedClient = null;
    cachedDb = null;
  }
}

export type { AtlasDb };
