/**
 * V7 T142 — Fathom External API client.
 *
 * Lists recent meetings and fetches summary + transcript. The API key lives
 * in the Cloudflare Pages dashboard ONLY (FATHOM_API_KEY) — never in the
 * repo; this module hard-errors when the key is missing (fail loud, no
 * silent empty sync). Endpoint overridable via FATHOM_API_URL for the live
 * smoke, defaulting to the documented external API base.
 *
 * Ingestion filter (per the V7 doc): title contains "Juno" (case-insensitive)
 * OR ≥ 3 participants, held within the last 90 days. The filter is a pure
 * exported function so the unit tests pin it without any network.
 */

export interface FathomMeeting {
  /** Fathom's stable recording id (the upsert key). */
  recordingId: string;
  title: string;
  /** ISO timestamp the call happened. */
  heldAt: string | null;
  /** Display names / emails as provided by the API. */
  participants: string[];
  summaryMd: string | null;
  transcriptMd: string | null;
}

const DEFAULT_API_URL = 'https://api.fathom.ai/external/v1';

function apiBase(): string {
  return (process.env.FATHOM_API_URL ?? DEFAULT_API_URL).replace(/\/$/, '');
}

function apiKey(): string {
  const key = process.env.FATHOM_API_KEY?.trim();
  if (!key) {
    throw new Error(
      'FATHOM_API_KEY is not set. Add it in the Cloudflare Pages dashboard (never the repo).'
    );
  }
  return key;
}

/** Pure — the T142 ingestion filter. Exported for unit tests. */
export function shouldIngestMeeting(
  m: { title: string; heldAt: string | null; participants: string[] },
  nowIso: string
): boolean {
  const relevant = m.title.toLowerCase().includes('juno') || m.participants.length >= 3;
  if (!relevant) return false;
  if (!m.heldAt) return false;
  const ageMs = new Date(nowIso).getTime() - new Date(m.heldAt).getTime();
  const days90 = 90 * 24 * 60 * 60 * 1000;
  return ageMs >= 0 ? ageMs <= days90 : true; // future-dated = clock skew, keep
}

/* Tolerant response shapes — Fathom's external API has evolved; read every
 * known alias and fall back to null rather than throwing on shape drift. */
interface RawMeeting {
  recording_id?: string | number;
  id?: string | number;
  title?: string;
  meeting_title?: string;
  created_at?: string;
  scheduled_start_time?: string;
  recording_start_time?: string;
  participants?: Array<{ name?: string; email?: string } | string>;
  calendar_invitees?: Array<{ name?: string; email?: string } | string>;
  summary?: { markdown_formatted?: string; text?: string } | string | null;
  default_summary?: string | null;
  transcript?: Array<{ speaker?: { display_name?: string }; text?: string }> | string | null;
}

interface RawListResponse {
  items?: RawMeeting[];
  meetings?: RawMeeting[];
  data?: RawMeeting[];
  next_cursor?: string | null;
}

function normParticipants(raw: RawMeeting): string[] {
  const list = raw.participants ?? raw.calendar_invitees ?? [];
  return list
    .map((p) => (typeof p === 'string' ? p : (p.name ?? p.email ?? '')))
    .filter((s) => s.length > 0);
}

function normSummary(raw: RawMeeting): string | null {
  if (typeof raw.summary === 'string') return raw.summary;
  if (raw.summary && typeof raw.summary === 'object') {
    return raw.summary.markdown_formatted ?? raw.summary.text ?? null;
  }
  return raw.default_summary ?? null;
}

function normTranscript(raw: RawMeeting): string | null {
  if (typeof raw.transcript === 'string') return raw.transcript;
  if (Array.isArray(raw.transcript)) {
    return raw.transcript
      .map((t) => `${t.speaker?.display_name ?? 'Speaker'}: ${t.text ?? ''}`)
      .join('\n');
  }
  return null;
}

/** Exported for unit tests — one raw API item → the normalized shape. */
export function normalizeMeeting(raw: RawMeeting): FathomMeeting | null {
  const recordingId = raw.recording_id ?? raw.id;
  const title = raw.title ?? raw.meeting_title;
  if (recordingId === undefined || !title) return null;
  return {
    recordingId: String(recordingId),
    title,
    heldAt: raw.scheduled_start_time ?? raw.recording_start_time ?? raw.created_at ?? null,
    participants: normParticipants(raw),
    summaryMd: normSummary(raw),
    transcriptMd: normTranscript(raw),
  };
}

/**
 * List + filter recent meetings (summary + transcript included). Paginates
 * by cursor up to `maxPages` (defensive cap — the 90-day filter bounds the
 * useful window anyway).
 */
export async function fetchRecentJunoMeetings(opts?: {
  nowIso?: string;
  maxPages?: number;
}): Promise<FathomMeeting[]> {
  const key = apiKey();
  const nowIso = opts?.nowIso ?? new Date().toISOString();
  const maxPages = opts?.maxPages ?? 5;
  const createdAfter = new Date(new Date(nowIso).getTime() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const out: FathomMeeting[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${apiBase()}/meetings`);
    url.searchParams.set('created_after', createdAfter);
    url.searchParams.set('include_transcript', 'true');
    if (cursor) url.searchParams.set('cursor', cursor);

    const res = await fetch(url.toString(), {
      headers: { 'X-Api-Key': key, Accept: 'application/json' },
    });
    if (!res.ok) {
      // QA hardening: the raw third-party error body stays in the server log
      // (CF captures console.error); the thrown message — which the sync
      // route surfaces to the browser — carries only the status.
      const body = await res.text().catch(() => '');
      console.error(`Fathom API ${res.status} response: ${body.slice(0, 500)}`);
      throw new Error(`Fathom API ${res.status} — sync failed; see server logs for detail.`);
    }
    const json = (await res.json()) as RawListResponse;
    const items = json.items ?? json.meetings ?? json.data ?? [];
    for (const raw of items) {
      const m = normalizeMeeting(raw);
      if (m && shouldIngestMeeting(m, nowIso)) out.push(m);
    }
    cursor = json.next_cursor ?? null;
    if (!cursor || items.length === 0) break;
  }

  return out;
}
