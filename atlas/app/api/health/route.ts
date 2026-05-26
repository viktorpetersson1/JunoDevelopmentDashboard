/**
 * GET /api/health
 *
 * Public liveness probe. Returns ONLY {status: 'ok'} — no commit SHA,
 * no build time, no env data. Per T084.2, that detail moved behind
 * super_admin auth at /api/health/detailed so unauthenticated curl can't
 * fingerprint the deploy.
 *
 * Should return < 50ms p95.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export function GET() {
  // Returning the bare object (not wrapped in `{data: …}`) per the V3
  // contract — the public probe is intentionally schema-stable for
  // uptime monitors and matches the doc's expected curl body.
  return NextResponse.json(
    { status: 'ok' },
    { status: 200, headers: { 'Cache-Control': 'no-store, must-revalidate' } }
  );
}
