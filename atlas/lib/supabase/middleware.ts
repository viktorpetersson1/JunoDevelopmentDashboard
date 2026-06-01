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
 * T086.1 — /robots.txt is also matched out via the middleware matcher,
 *          but listed here as belt-and-braces in case the matcher misses.
 */
const PUBLIC_ROUTES = ['/sign-in', '/sign-up', '/api/health', '/robots.txt', '/cleanup'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** T086.3 — paths that the middleware actively guards. Anything NOT in
 *  this list and NOT in PUBLIC_ROUTES falls through to Next.js's
 *  not-found handler (proper 404 instead of a 307-to-sign-in dead-end).
 *
 *  Root `/` is treated as protected because it's a thin redirect to the
 *  canonical post-login surface and needs the auth gate to fire.
 */
const PROTECTED_PREFIXES = [
  '/',
  '/dashboard',
  '/projects',
  '/pipeline',
  '/cashflow',
  '/notifications',
  '/settings',
  '/pricing',
  '/waterfall', // V4.4 — owner waterfall (INVENTORY §18)
  '/sensitivity', // V4.6 — tornado (INVENTORY §20)
  '/scenario', // V4.5 — scenarios editor (INVENTORY §19)
  '/risk', // V4.7 — Monte Carlo stress test (INVENTORY §22, singular `/risk`)
  '/suggestions', // V4.8 — suggestions queue (INVENTORY §25, editor+)
  '/api',
  '/dev', // dev-only routes; production-blocked in atlas/middleware.ts
];

function isProtectedPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return PROTECTED_PREFIXES.some(
    (p) => p !== '/' && (pathname === p || pathname.startsWith(`${p}/`))
  );
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

// ─────────────────────────────────────────────────────────────────────────
// T089 — security headers via middleware.
//
// Cloudflare Pages applies public/_headers only to STATIC assets.
// Pages Functions (every Next.js SSR/edge route via @cloudflare/next-on-pages)
// bypass _headers entirely, and `next-on-pages` 1.13.7 does NOT propagate
// next.config.mjs headers() to Function output either — both would silently
// fail the same way. The only reliable path on this stack is the middleware,
// which already runs on every HTML + API request. We pair these with the
// existing public/_headers (which still protects /robots.txt, /icon.svg,
// /sw.js, /_next/static/*, etc.) for full coverage with no duplication.
//
// Verified by differential curl 1 Jun 2026: pre-fix /robots.txt got CSP
// and referrer-policy from _headers; /sign-in got neither.
// ─────────────────────────────────────────────────────────────────────────

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
} as const;

// CSP for HTML routes.
// `unsafe-inline` + `unsafe-eval` on script-src are V3-known relaxations
// (D-014) — Next.js's inlined chunks + runtime preamble need them today.
// Nonce migration is tracked separately.
// `connect-src` includes Sentry ingest hosts so error reporting works once
// SENTRY_DSN is set (D-020) without us having to come back here.
const CSP_HTML = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function applySecurityHeaders(request: NextRequest, response: NextResponse): void {
  const path = request.nextUrl.pathname;
  // Belt-and-braces: the middleware matcher already excludes static asset
  // paths. Skip here in case a future matcher edit accidentally lets them
  // through (we don't want to clobber the long-lived immutable Cache-Control
  // on hashed chunks).
  if (path.startsWith('/_next/static/') || path.startsWith('/__next-on-pages-dist__/')) {
    return;
  }
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
  // CSP is for HTML — API routes ship JSON, no inline scripts, and
  // frame-ancestors on a JSON body is meaningless. Matches the _headers split.
  if (!path.startsWith('/api/')) {
    response.headers.set('Content-Security-Policy', CSP_HTML);
  }
}

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request });
  applyCacheHeaders(request, response);
  applySecurityHeaders(request, response);

  // V4-fix — Clear-Site-Data on /cleanup. The browser processes this
  // header BEFORE the page renders, nuking every cache + SW registration
  // for the origin. Pairs with app/cleanup/page.tsx, which shows a
  // friendly progress message and meta-refreshes to /. Cookies are
  // intentionally NOT cleared so authenticated users don't get logged
  // out by hitting /cleanup — they'll just lose their stale SW + cache.
  if (request.nextUrl.pathname === '/cleanup') {
    response.headers.set(
      'Clear-Site-Data',
      '"cache", "storage", "executionContexts"'
    );
  }

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

    // T086.3 — unknown unauthenticated routes (e.g. `/pipelinex`) fall
    // through to Next.js's not-found handler instead of bouncing to
    // /sign-in. Cleaner UX (real 404) + cleaner threat model (no oracle
    // for path-existence via the redirect target).
    if (!user && !isPublicPath(request.nextUrl.pathname) && !isProtectedPath(request.nextUrl.pathname)) {
      return response;
    }

    // Protected route guard
    if (!user && !isPublicPath(request.nextUrl.pathname)) {
      // T084.1 — API consumers (curl, mobile apps, partner integrations,
      // automation scripts) get a proper 401 JSON envelope. Page navigations
      // keep the friendlier 307-to-sign-in.
      const isApi = request.nextUrl.pathname.startsWith('/api/');
      const wantsJson = request.headers.get('accept')?.includes('application/json');
      if (isApi || wantsJson) {
        const body = JSON.stringify({
          error: { code: 'AUTH_REQUIRED', message: 'Unauthorized' },
        });
        const jsonResponse = new NextResponse(body, {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'WWW-Authenticate': 'Bearer realm="atlas"',
            'Cache-Control': 'no-store, must-revalidate',
          },
        });
        applySecurityHeaders(request, jsonResponse);
        return jsonResponse;
      }

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
      applySecurityHeaders(request, redirect);
      return redirect;
    }

    // Signed-in user hitting /, /sign-in, or /sign-up → bounce to canonical home.
    //
    // Including `/` here (V4-fix-3) is critical: app/page.tsx calls
    // `redirect('/dashboard')` server-side, but on @cloudflare/next-on-pages
    // 1.13.7 + Next 14.2.18 a synchronous redirect() from a non-async Server
    // Component occasionally gets misclassified as "not found" by the
    // adapter, rendering app/not-found.tsx with HTTP 200 instead of a 307.
    // Unauthenticated users never hit the page (middleware redirects them
    // earlier), so the bug only ever fires for signed-in users — which made
    // it invisible until prod had an authenticated session.
    //
    // The clean fix is to handle the redirect here so the page component
    // is never invoked for signed-in users on `/`. app/page.tsx is kept
    // as belt-and-braces, now async for additional robustness.
    if (
      user &&
      (request.nextUrl.pathname === '/' ||
        request.nextUrl.pathname === '/sign-in' ||
        request.nextUrl.pathname === '/sign-up')
    ) {
      const home = request.nextUrl.clone();
      home.pathname = CANONICAL_POST_LOGIN;
      home.search = '';
      const redirect = NextResponse.redirect(home);
      applyCacheHeaders(request, redirect);
      applySecurityHeaders(request, redirect);
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
