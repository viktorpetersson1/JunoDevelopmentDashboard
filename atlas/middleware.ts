/**
 * Next.js root middleware — runs on every matching request before the
 * route handler. Delegates to lib/supabase/middleware.ts for session
 * refresh + protected-route gating.
 *
 * Matcher excludes:
 *   - _next/* (build artifacts)
 *   - static asset extensions
 *   - favicon
 *
 * See docs/handoff/SUPABASE_TRANSLATION.md §2.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/middleware';
import { parkedRedirect } from './lib/flags';

export async function middleware(request: NextRequest) {
  // V7 T134 — surface parking (Rule 4). Parked routes 302 to the nearest
  // surviving surface unless re-enabled via ATLAS_FEATURE_FLAGS.
  const parked = parkedRedirect(request.nextUrl.pathname);
  if (parked) {
    const url = request.nextUrl.clone();
    url.pathname = parked;
    url.search = '';
    return NextResponse.redirect(url, { status: 302 });
  }

  // T073: dev-only routes (/dev/*) return 404 in production builds. Belt-
  // and-suspenders with the page-level guard so prod traffic never hits
  // the demo content. (Can't use /_dev because Next.js treats underscore-
  // prefixed folders as private and excludes them from routing entirely.)
  if (process.env.NODE_ENV === 'production' && request.nextUrl.pathname.startsWith('/dev')) {
    return new NextResponse('Not Found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store, must-revalidate' },
    });
  }

  // T098 — 301 redirects for the 7 routes moved under /analytics.
  // These are permanent redirects; they keep old bookmarks alive and prevent
  // any lingering cf-pages cache from serving a 404.
  // V7 T135 — the four treasury surfaces are ABSORBED into Home: their URLs
  // 301 to the owning /dashboard section anchor (they are not flag-parked —
  // Home IS the surface now). Targets may carry a #fragment.
  const ANALYTICS_REDIRECTS: Record<string, string> = {
    '/cashflow': '/dashboard',
    '/capital': '/analytics/capital',
    '/waterfall': '/analytics/waterfall',
    '/sensitivity': '/analytics/sensitivity',
    '/scenario': '/analytics/scenarios',
    '/risk': '/analytics/stress',
    '/risks': '/analytics/risks',
    // T110 (V6.1): /analytics/forecast deleted — Annual P&L promoted to Home.
    '/analytics/forecast': '/dashboard',
    // V7 T135 — absorbed into Home.
    '/analytics': '/dashboard',
    '/analytics/capital': '/dashboard#capital',
    '/analytics/cash-schedule': '/dashboard#requirements',
    '/analytics/loc': '/dashboard#capital',
    '/analytics/self-funding': '/dashboard#self-funding',
  };
  const pathname = request.nextUrl.pathname;
  const redirectTarget = ANALYTICS_REDIRECTS[pathname];
  if (redirectTarget) {
    const url = request.nextUrl.clone();
    const [path, hash] = redirectTarget.split('#');
    url.pathname = path ?? redirectTarget;
    url.hash = hash ? `#${hash}` : '';
    return NextResponse.redirect(url, { status: 301 });
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - image/font/manifest extensions
     * - robots.txt + sitemap.xml (T086.1 — must be reachable without auth)
     */
    '/((?!_next/static|_next/image|favicon.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot)$).*)',
  ],
};
