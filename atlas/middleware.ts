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
import type { NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/middleware';

export async function middleware(request: NextRequest) {
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
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot)$).*)',
  ],
};
