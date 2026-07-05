import { test, expect } from '@playwright/test';

/**
 * V7 T142–T145 — Ask Juno upgrade routing + gating.
 *
 * The authed flows (sync → review → approve → applied; draft → save) need
 * the seeded test user + live keys (FATHOM_API_KEY / ANTHROPIC_API_KEY live
 * in the Cloudflare dashboard only) — written below and skipped (T085
 * pattern). What runs today: every new endpoint EXISTS and is auth-gated —
 * unauthenticated calls never succeed and never 404. The behavioural seams
 * are unit-locked (fathom-client, meeting-review, apply-suggestion,
 * draft-metrics: 40+ tests).
 */

test.describe('T142–T145 endpoints (no auth needed)', () => {
  const POSTS = [
    '/api/meetings/sync',
    '/api/agent/review-meeting',
    '/api/opportunities/00000000-0000-0000-0000-000000000001/draft-metrics',
    // AJ-v3 working pane
    '/api/ask-juno',
    '/api/ask-juno/attachments',
  ];

  for (const path of POSTS) {
    test(`POST ${path} unauthenticated is rejected (wired + gated)`, async ({ request }) => {
      const res = await request.post(path);
      expect(res.status()).not.toBe(404);
      expect(res.status()).toBeGreaterThanOrEqual(400);
    });
  }

  test('suggestions transition endpoint still gated (T144 rides it)', async ({ request }) => {
    const res = await request.patch('/api/suggestions/00000000-0000-0000-0000-000000000001', {
      data: { status: 'approved' },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe.skip('T142–T145 full flows (needs test user + live keys)', () => {
  test('sync → two recent Juno meetings listed with transcripts', async () => {
    // 1. signInAsTestUser(); goto /agent
    // 2. click "Sync meetings"; expect the two most recent Juno Executive
    //    Meetings to appear with participant counts + transcript markers
  });
  test('review latest meeting files evidence-quoted suggestions; approve applies', async () => {
    // 1. seed a meeting whose transcript says the 6GC target is $4.85M while
    //    Atlas holds $4.6M
    // 2. click "Review latest meeting" → exactly ONE suggestion on Home with
    //    the verbatim quote
    // 3. Approve → project updated + audit row + status applied
    // 4. Reject path leaves data untouched
  });
  test('draft metrics pre-fills the form; nothing persists until Save', async () => {
    // 1. open 72 South Ferry Rd detail → "Ask Juno to draft key metrics"
    // 2. plausible populated fields + reasoning shown; DB unchanged
    // 3. Save → PATCH persists; call ledgered in agent_llm_calls
  });
});
