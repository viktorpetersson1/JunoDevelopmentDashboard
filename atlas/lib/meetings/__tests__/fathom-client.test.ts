/**
 * V7 T142 — Fathom client unit tests (mocked API, no key in repo/CI).
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { shouldIngestMeeting, normalizeMeeting, fetchRecentJunoMeetings } from '../fathom-client';

const NOW = '2026-07-03T12:00:00Z';

describe('shouldIngestMeeting (the T142 filter)', () => {
  it('title contains "Juno" (case-insensitive) within 90 days → ingest', () => {
    expect(
      shouldIngestMeeting(
        { title: 'JUNO Executive Meeting', heldAt: '2026-06-17T15:00:00Z', participants: [] },
        NOW
      )
    ).toBe(true);
  });

  it('≥3 participants without "Juno" in the title → ingest', () => {
    expect(
      shouldIngestMeeting(
        { title: 'Weekly sync', heldAt: '2026-06-01T15:00:00Z', participants: ['a', 'b', 'c'] },
        NOW
      )
    ).toBe(true);
  });

  it('2 participants, no "Juno" → skip; older than 90 days → skip; no date → skip', () => {
    expect(
      shouldIngestMeeting(
        { title: '1:1', heldAt: '2026-06-01T15:00:00Z', participants: ['a', 'b'] },
        NOW
      )
    ).toBe(false);
    expect(
      shouldIngestMeeting(
        { title: 'Juno kickoff', heldAt: '2026-01-01T15:00:00Z', participants: [] },
        NOW
      )
    ).toBe(false);
    expect(
      shouldIngestMeeting({ title: 'Juno kickoff', heldAt: null, participants: [] }, NOW)
    ).toBe(false);
  });
});

describe('normalizeMeeting (tolerant shapes)', () => {
  it('maps ids/titles/participants/summary/transcript across aliases', () => {
    const m = normalizeMeeting({
      recording_id: 12345,
      title: 'Juno Executive Meeting',
      scheduled_start_time: '2026-06-17T15:00:00Z',
      participants: [{ name: 'Viktor' }, { email: 'lucas@x.com' }, 'Melissa'],
      summary: { markdown_formatted: '## Agreed: 6GC target $4.85M' },
      transcript: [
        { speaker: { display_name: 'Viktor' }, text: 'We agreed the 6GC target is $4.85M.' },
      ],
    });
    expect(m).not.toBeNull();
    expect(m!.recordingId).toBe('12345');
    expect(m!.participants).toEqual(['Viktor', 'lucas@x.com', 'Melissa']);
    expect(m!.summaryMd).toContain('4.85');
    expect(m!.transcriptMd).toBe('Viktor: We agreed the 6GC target is $4.85M.');
  });

  it('missing id or title → null (skipped, not thrown)', () => {
    expect(normalizeMeeting({ title: 'No id' })).toBeNull();
    expect(normalizeMeeting({ recording_id: 'x' })).toBeNull();
  });
});

describe('fetchRecentJunoMeetings (mocked fetch)', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    process.env.FATHOM_API_KEY = 'test-key';
  });
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.FATHOM_API_KEY;
  });

  it('paginates, filters, and sends the API key header', async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(url));
      expect((init?.headers as Record<string, string>)['X-Api-Key']).toBe('test-key');
      const page1 = String(url).includes('cursor=') === false;
      return new Response(
        JSON.stringify(
          page1
            ? {
                items: [
                  {
                    recording_id: 'r1',
                    title: 'Juno Executive Meeting',
                    created_at: '2026-06-17T15:00:00Z',
                    participants: ['V', 'L', 'M'],
                    summary: 'agreed things',
                  },
                  {
                    recording_id: 'r2',
                    title: '1:1',
                    created_at: '2026-06-17T15:00:00Z',
                    participants: ['V', 'L'],
                  },
                ],
                next_cursor: 'page2',
              }
            : {
                items: [
                  {
                    recording_id: 'r3',
                    title: 'Design review',
                    created_at: '2026-06-01T10:00:00Z',
                    participants: ['V', 'L', 'M', 'K'],
                  },
                ],
                next_cursor: null,
              }
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    const out = await fetchRecentJunoMeetings({ nowIso: NOW });
    expect(calls).toHaveLength(2);
    expect(out.map((m) => m.recordingId)).toEqual(['r1', 'r3']); // r2 filtered (2 ppl, no Juno)
  });

  it('missing key → hard error naming the fix (never a silent empty sync)', async () => {
    delete process.env.FATHOM_API_KEY;
    await expect(fetchRecentJunoMeetings({ nowIso: NOW })).rejects.toThrow(/FATHOM_API_KEY/);
  });

  it('API error → throws with status (fail loud)', async () => {
    global.fetch = vi.fn(
      async () => new Response('nope', { status: 401 })
    ) as unknown as typeof fetch;
    await expect(fetchRecentJunoMeetings({ nowIso: NOW })).rejects.toThrow(/Fathom API 401/);
  });
});
