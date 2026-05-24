/**
 * Server-side Supabase client for use in Server Components, Route Handlers,
 * and Server Actions.
 *
 * Cookie handling is delegated to next/headers cookies(). Each request gets
 * a fresh client; never cache the result across requests.
 *
 * See docs/handoff/SUPABASE_TRANSLATION.md §2 (T009).
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set'
    );
  }

  const cookieStore = cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // Server Components cannot set cookies. The setAll API is required
        // by @supabase/ssr but most server-side reads don't trigger cookie
        // writes. When a Server Action / Route Handler needs to refresh
        // tokens, swap to a context that can mutate cookies (Route Handler
        // gets a writable cookies() store).
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component — set is a no-op there. The
          // middleware.ts session refresh handles cookie persistence.
        }
      },
    },
  });
}

/**
 * Server-side client with the SERVICE ROLE key — BYPASSES RLS. Use ONLY in:
 *   - Drizzle migrations / scripts
 *   - Audit-log inserts (T012) where the server is the trusted writer
 *   - Admin-only cron jobs
 *
 * Never expose this to a client component or leak the key in any response.
 */
export function createSupabaseServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on the server'
    );
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // service-role client has no user session — cookies are irrelevant
      },
    },
  });
}
