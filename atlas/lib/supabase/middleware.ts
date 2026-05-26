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

/** Public routes that don't require authentication.
 *
 * T081.1 — /sign-up is the branded invite-only page (was a silent 307 to
 *          /sign-in before; now reachable directly).
 */
const PUBLIC_ROUTES = ['/sign-in', '/sign-up', '/api/health'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** T081.3 + T085 — canonical post-login surface. `/` is a thin redirect
 *  to /dashboard (see app/page.tsx), so unauthenticated `/` should bounce
 *  the user toward /dashboard, not back to `/` (which would loop). */
const CANONICAL_POST_LOGIN = '/dashboard';

/**
 * Apply cache-control headers that match public/_headers.
 *
 * Why both? public/_headers is the CDN-level guard; setting the same
 * headers on the function response means even if the CDN tier is
 * bypassed (preview URL, custom domain misconfigured, etc.), the
 * browser still gets no-store on HTML. Belt + suspenders.
 *
 * Static asset paths (under /_next/static/*) are excluded — the
 * matcher filter already skips them, but this is defensive in case
 * a new path ever sneaks past.
 */
function applyCacheHeaders(request: NextRequest, response: NextResponse): void {
  const path = request.nextUrl.pathname;
  if (path.startsWith('/_next/static/') || path.startsWith('/__next-on-pages-dist__/')) {
    // Immutable hashed chunks — keep CDN/browser caching aggressively.
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    return;
  }
  // Everything else (HTML pages, API routes, redirects) must always
  // round-trip to the function so a redeploy is visible on next load.
  response.headers.set('Cache-Control', 'no-store, must-revalidate');
}

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request });
  applyCacheHeaders(request, response);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // No Supabase config — let the request through; routes will fail fast
    // with a clear error if they try to use the DB. This is the dev-without
    // -env mode that lets `pnpm dev` boot without crashing. Also surfaces
    // the gap as a header so curl/Playwright can verify the deploy is wired
    // before chasing other red herrings.
    response.headers.set('x-atlas-supabase-config', 'missing');
    return response;
  }

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

    // IMPORTANT: refresh tokens on every request so server-side reads see a
    // fresh session. getUser() validates the JWT against Supabase Auth.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Protected route guard
    if (!user && !isPublicPath(request.nextUrl.pathname)) {
      const signInUrl = request.nextUrl.clone();
      signInUrl.pathname = '/sign-in';
      // T081.3 — for root `/`, route the redirect to the canonical
      // surface so the post-login bounce lands somewhere stable. For any
      // other path, preserve it so the user resumes where they intended.
      const target =
        request.nextUrl.pathname === '/' ? CANONICAL_POST_LOGIN : request.nextUrl.pathname;
      signInUrl.searchParams.set('redirectTo', target);
      const redirect = NextResponse.redirect(signInUrl);
      applyCacheHeaders(request, redirect);
      return redirect;
    }

    // Signed-in user hitting /sign-in or /sign-up → bounce to canonical home.
    if (
      user &&
      (request.nextUrl.pathname === '/sign-in' || request.nextUrl.pathname === '/sign-up')
    ) {
      const home = request.nextUrl.clone();
      home.pathname = CANONICAL_POST_LOGIN;
      home.search = '';
      const redirect = NextResponse.redirect(home);
      applyCacheHeaders(request, redirect);
      return redirect;
    }

    return response;
  } catch (err) {
    // Cloudflare edge runtime sometimes throws inside createServerClient or
    // auth.getUser() if the Supabase URL is malformed, the network call to
    // Supabase Auth fails, or a Node API isn't available under nodejs_compat.
    // Without a catch the entire app 500s — log + fall through so static
    // shells still render and /api/health stays reachable for diagnostics.
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[atlas middleware] updateSession failed:', msg);
    response.headers.set('x-atlas-middleware-error', msg.slice(0, 200));
    return response;
  }
}
