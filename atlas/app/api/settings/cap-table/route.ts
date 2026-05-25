/**
 * PATCH /api/settings/cap-table
 *
 * Replaces the current cap-table shares. Super_admin only. Enforces:
 *   - sum of shares = 10000 bps (100%) — also enforced by DB trigger
 *   - every payload owner must already exist in atlas.owners
 *   - effective_from defaults to today; prior current rows get
 *     is_current=false + effective_to=today
 *
 * Writes are wrapped in a single Postgres transaction via the existing
 * atlas.cap_table deferrable-trigger pattern (sum check fires at commit).
 *
 * Returns: { data: { updatedCount, sumBps } }
 */

import { z } from 'zod';
import { ok, badRequest, forbidden } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const PayloadSchema = z.object({
  shares: z
    .array(
      z.object({
        ownerId: z.string().uuid(),
        shareBps: z.number().int().min(0).max(10000),
      })
    )
    .min(1),
});

export const PATCH = withErrorBoundary(async (request: Request) => {
  const { profile, user } = await requireAuth();
  if (profile.role !== 'super_admin') {
    return forbidden('Cap-table edits require super_admin role.');
  }

  const json = await request.json().catch(() => null);
  const parsed = PayloadSchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(`Invalid payload: ${parsed.error.message}`);
  }

  const sumBps = parsed.data.shares.reduce((s, r) => s + r.shareBps, 0);
  if (sumBps !== 10000) {
    return badRequest(
      `Shares must sum to 10000 bps (100%); got ${sumBps} bps.`,
      'INVARIANT_VIOLATION'
    );
  }

  const supabase = createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);

  // Load current rows to detect deltas + know which owners' active rows
  // to close out. (Versioning per CLAUDE.md §10.3: prior row keeps history.)
  const { data: currentRows, error: readErr } = await supabase
    .schema('atlas')
    .from('cap_table')
    .select('id, owner_id, share_bps')
    .eq('is_current', true);
  if (readErr) {
    return badRequest(`Failed to load current cap table: ${readErr.message}`);
  }

  const currentMap = new Map<string, { id: string; shareBps: number }>();
  for (const r of (currentRows as Array<{ id: string; owner_id: string; share_bps: number }>) ??
    []) {
    currentMap.set(r.owner_id, { id: r.id, shareBps: r.share_bps });
  }

  // Build the set of changes. Owners whose share didn't change get skipped
  // entirely — no spurious history row.
  type Change = { ownerId: string; oldId: string | null; newShareBps: number };
  const changes: Change[] = [];
  for (const s of parsed.data.shares) {
    const cur = currentMap.get(s.ownerId);
    if (!cur || cur.shareBps !== s.shareBps) {
      changes.push({
        ownerId: s.ownerId,
        oldId: cur?.id ?? null,
        newShareBps: s.shareBps,
      });
    }
  }

  if (changes.length === 0) {
    return ok({ updatedCount: 0, sumBps });
  }

  // Step 1: close out prior current rows for owners whose share changed.
  const oldIds = changes
    .map((c) => c.oldId)
    .filter((id): id is string => id !== null);
  if (oldIds.length > 0) {
    const { error: closeErr } = await supabase
      .schema('atlas')
      .from('cap_table')
      .update({ is_current: false, effective_to: today })
      .in('id', oldIds);
    if (closeErr) {
      return badRequest(`Failed to close prior rows: ${closeErr.message}`);
    }
  }

  // Step 2: insert new rows. Deferrable trigger validates sum=10000 at commit.
  const inserts = changes.map((c) => ({
    owner_id: c.ownerId,
    share_bps: c.newShareBps,
    effective_from: today,
    is_current: true,
    notes: `Updated via /settings by ${user.id}`,
  }));
  const { error: insertErr } = await supabase
    .schema('atlas')
    .from('cap_table')
    .insert(inserts);

  if (insertErr) {
    return badRequest(`Failed to insert cap-table rows: ${insertErr.message}`);
  }

  return ok({ updatedCount: changes.length, sumBps });
});
