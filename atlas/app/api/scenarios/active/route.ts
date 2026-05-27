/**
 * /api/scenarios/active — set/clear the active-scenario cookie.
 *
 * POST { id: string | null }
 *   Any authenticated user can set their own active scenario.
 *   id === null → clears the cookie (reverts to base case).
 *   id provided → must exist in atlas.scenarios; rejects with 404 otherwise.
 *
 * The cookie is HttpOnly + same-site so it can't be spoofed from client JS
 * (the picker uses this endpoint, never document.cookie directly). 30-day
 * max-age — long enough to survive a session refresh, short enough to not
 * persist forever after deletion.
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest, notFound } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { findScenarioById } from '@/lib/repos/scenarios';
import { ACTIVE_SCENARIO_COOKIE } from '@/lib/scenarios/active';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

const PostBodySchema = z.object({
  id: z.string().uuid().nullable(),
});

export const POST = withErrorBoundary(async (req: NextRequest) => {
  await requireAuth();
  const json = await req.json().catch(() => null);
  const parsed = PostBodySchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }

  // If clearing — just unset the cookie.
  if (parsed.data.id === null) {
    const res = ok({ active: null, displayName: 'Base case' });
    res.cookies.set({
      name: ACTIVE_SCENARIO_COOKIE,
      value: '',
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    return res;
  }

  // Validate the scenario exists before setting the cookie. Without this
  // guard a stale id could persist forever and only fail on the next
  // page render.
  const scenario = await findScenarioById(parsed.data.id);
  if (!scenario) return notFound('Scenario not found');

  const res = ok({ active: scenario.id, displayName: scenario.name });
  res.cookies.set({
    name: ACTIVE_SCENARIO_COOKIE,
    value: scenario.id,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
});
