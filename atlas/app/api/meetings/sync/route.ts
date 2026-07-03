/**
 * POST /api/meetings/sync — V7 T142: pull recent Juno meetings from Fathom.
 *
 * Editor+ only. Calls the Fathom External API (FATHOM_API_KEY — Cloudflare
 * Pages dashboard ONLY), filters (title contains "Juno" OR ≥3 participants,
 * last 90 days), and idempotently upserts into atlas.meetings keyed on
 * fathom_recording_id — re-syncs are safe. No cron: this button is the only
 * trigger (per the V7 doc).
 */

import type { NextRequest } from 'next/server';
import { ok, serverError } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { fetchRecentJunoMeetings } from '@/lib/meetings/fathom-client';
import { upsertMeetings, listMeetings } from '@/lib/repos/meetings';
import { recordMutation } from '@/lib/services/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

let cachedOrgId: string | null = null;
async function resolveOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.schema('atlas').from('orgs').select('id').limit(1).single();
  const id = (data as { id: string } | null)?.id ?? '00000000-0000-0000-0000-000000000000';
  cachedOrgId = id;
  return id;
}

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  let fetched;
  try {
    fetched = await fetchRecentJunoMeetings();
  } catch (err) {
    // Fail loud with the reason (missing key / API error) — never a silent
    // empty sync that reads as "no meetings".
    return serverError(err instanceof Error ? err.message : String(err), 'FATHOM_SYNC_FAILED');
  }

  const { upserted } = await upsertMeetings(fetched);
  const meetings = await listMeetings({ limit: 20 });

  try {
    const orgId = await resolveOrgId();
    await recordMutation({
      orgId,
      userId: user.id,
      route: req.nextUrl.pathname,
      method: 'POST',
      statusCode: 200,
      source: 'ui',
      after: { fetched: fetched.length, upserted },
    });
  } catch {
    // best-effort
  }

  return ok({
    fetched: fetched.length,
    upserted,
    meetings: meetings.map((m) => ({
      id: m.id,
      title: m.title,
      heldAt: m.heldAt,
      participants: m.participants.length,
      hasTranscript: !!m.transcriptMd,
    })),
  });
});
