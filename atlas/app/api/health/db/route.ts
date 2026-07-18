/**
 * GET /api/health/db
 *
 * Public DATABASE liveness probe — unlike /api/health (static, never
 * touches Supabase), this performs one head-only count so the request
 * registers as real project activity.
 *
 * Exists because the free-tier Supabase project auto-pauses after ~7 days
 * without API traffic, which took the whole site down on 18 Jul 2026
 * (sign-in and every query fail while paused). The scheduled keepalive
 * workflow (.github/workflows/keepalive.yml) hits this endpoint every
 * 3 days so the project always sees traffic — and turns red if the
 * database is actually down.
 *
 * Reveals nothing but up/down: no counts, no rows, no env detail
 * (T084.2 fingerprinting rule upheld).
 */
import { NextResponse } from 'next/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export async function GET() {
  const headers = { 'Cache-Control': 'no-store, must-revalidate' };
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { error } = await supabase
      .schema('atlas')
      .from('projects')
      .select('project_key', { head: true, count: 'exact' });
    if (error) {
      return NextResponse.json({ ok: false }, { status: 503, headers });
    }
    return NextResponse.json({ ok: true }, { status: 200, headers });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers });
  }
}
