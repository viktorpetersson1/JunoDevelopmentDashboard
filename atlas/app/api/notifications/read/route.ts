/**
 * PATCH /api/notifications/read
 *
 * Marks one or more notifications as read. RLS on atlas.notifications gates
 * to the current user — the repo helper trusts the row policy.
 *
 * Body: { ids: string[] }  — or omit ids to mark all unread.
 * Returns: { data: { updated: number } }
 */

import { z } from 'zod';
import { ok, badRequest } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import {
  markAllNotificationsRead,
  markNotificationsRead,
} from '@/lib/repos/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

const PayloadSchema = z.object({
  ids: z.array(z.string().uuid()).optional(),
});

export const PATCH = withErrorBoundary(async (request: Request) => {
  await requireAuth();
  const json = await request.json().catch(() => ({}));
  const parsed = PayloadSchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(`Invalid payload: ${parsed.error.message}`);
  }
  const ids = parsed.data.ids ?? [];
  const updated = ids.length > 0 ? await markNotificationsRead(ids) : await markAllNotificationsRead();
  return ok({ updated });
});
