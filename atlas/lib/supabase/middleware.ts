/**
 * Supabase session refresh helper, called from the Next.js root middleware.
 *
 * Refreshes the user's auth tokens on every request and propagates updated
 * cookies back through NextResponse. Also handles unauthenticated → /sign-in
 * redirect for protected routes.
 *
 * See docs/handoff/SUPABASE_TRANSLATION.md §2 (T009 translation of bundle's
 * Clerk middleware).
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Public routes that don't require authentication. */
const PUBLIC_ROUTES = ['/sign-in', '/api/health'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // No Supabase config — let the request through; routes will fail fast
    // with a clear error if they try to use the DB. This is the dev-without
    // -env mode that lets `pnpm dev` boot without crashing.
    return response;
  }

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

  // IMPORTANT: refresh tokens on every request so server-side reads see a
  // fresh session. getUser() validates the JWT against Supabase Auth.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protected route guard
  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = '/sign-in';
    signInUrl.searchParams.set('redirectTo', request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Signed-in user hitting /sign-in → bounce to home
  if (user && request.nextUrl.pathname === '/sign-in') {
    const home = request.nextUrl.clone();
    home.pathname = '/';
    home.search = '';
    return NextResponse.redirect(home);
  }

  return response;
}
