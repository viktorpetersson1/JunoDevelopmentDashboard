/**
 * POST /api/auth/signout — clear the Supabase session cookies and redirect.
 *
 * Called by the UserMenu in the topbar (T071-follow / V5.2 visual feedback —
 * the sidebar footer chip was dead). Posts so it isn't triggered by prefetch.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });
    await supabase.auth.signOut();
  } catch {
    // best-effort; the client will redirect either way.
  }
  return response;
}
