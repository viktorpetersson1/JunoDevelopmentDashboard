/**
 * Browser-side Supabase client for use in React Client Components.
 *
 * Reads cookies via the browser context; safe to call from any 'use client'
 * boundary. Server Components must use `lib/supabase/server.ts` instead.
 *
 * See docs/handoff/SUPABASE_TRANSLATION.md §2 (T009) for why we use
 * @supabase/ssr instead of @clerk/nextjs.
 */
import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in .env.local'
    );
  }

  return createBrowserClient(url, key);
}
