/**
 * Meetings repo (V7 T142).
 *
 * atlas.meetings — Fathom-ingested meeting records. Upsert is idempotent on
 * fathom_recording_id so re-syncs are safe (the T142 requirement).
 */

import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import type { FathomMeeting } from '@/lib/meetings/fathom-client';

export interface MeetingView {
  id: string;
  fathomRecordingId: string;
  title: string;
  heldAt: string | null;
  participants: string[];
  summaryMd: string | null;
  transcriptMd: string | null;
  ingestedAt: string;
}

interface MeetingRow {
  id: string;
  fathom_recording_id: string;
  title: string;
  held_at: string | null;
  participants: string[] | null;
  summary_md: string | null;
  transcript_md: string | null;
  ingested_at: string;
}

const SELECT_COLUMNS =
  'id, fathom_recording_id, title, held_at, participants, summary_md, transcript_md, ingested_at';

function toView(row: MeetingRow): MeetingView {
  return {
    id: row.id,
    fathomRecordingId: row.fathom_recording_id,
    title: row.title,
    heldAt: row.held_at,
    participants: row.participants ?? [],
    summaryMd: row.summary_md,
    transcriptMd: row.transcript_md,
    ingestedAt: row.ingested_at,
  };
}

/** Newest first. `withTranscript: false` keeps list payloads light. */
export async function listMeetings(opts?: { limit?: number }): Promise<MeetingView[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('meetings')
    .select(SELECT_COLUMNS)
    .order('held_at', { ascending: false, nullsFirst: false })
    .limit(opts?.limit ?? 50);
  if (error) throw new Error(`listMeetings: ${error.message}`);
  return ((data ?? []) as unknown as MeetingRow[]).map(toView);
}

export async function findMeetingById(id: string): Promise<MeetingView | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('meetings')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`findMeetingById: ${error.message}`);
  return data ? toView(data as unknown as MeetingRow) : null;
}

/** The newest meeting by held_at (T144's review target). */
export async function findLatestMeeting(): Promise<MeetingView | null> {
  const rows = await listMeetings({ limit: 1 });
  return rows[0] ?? null;
}

/** Idempotent upsert on fathom_recording_id. Returns inserted/updated counts. */
export async function upsertMeetings(meetings: FathomMeeting[]): Promise<{ upserted: number }> {
  if (meetings.length === 0) return { upserted: 0 };
  const supabase = createSupabaseServiceRoleClient();
  const rows = meetings.map((m) => ({
    fathom_recording_id: m.recordingId,
    title: m.title,
    held_at: m.heldAt,
    participants: m.participants,
    summary_md: m.summaryMd,
    transcript_md: m.transcriptMd,
    ingested_at: new Date().toISOString(),
  }));
  const { error, count } = await supabase
    .schema('atlas')
    .from('meetings')
    .upsert(rows, { onConflict: 'fathom_recording_id', count: 'exact' });
  if (error) throw new Error(`upsertMeetings: ${error.message}`);
  return { upserted: count ?? rows.length };
}
