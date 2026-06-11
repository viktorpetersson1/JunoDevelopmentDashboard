/**
 * POST /api/agent/runs — create an agent run (editor+; D-078). Cheap insert,
 * status 'planning'; the first `advance` does the planning call.
 * GET  /api/agent/runs — list runs visible to the caller (RLS-scoped).
 */
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, created, badRequest } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { agentModel } from '@/lib/agent/config';
import { createRun, listRunsForUser } from '@/lib/repos/agent-runs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

const CreateSchema = z.object({
  goal: z.string().trim().min(1).max(4000),
  pathname: z.string().max(500).optional(),
});

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile); // run an agent = editor+ (D-078)

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues.map((i) => `${i.path.join('.')} — ${i.message}`).join('; ')}`,
      'VALIDATION_FAILED'
    );
  }

  const run = await createRun({
    createdBy: user.id,
    goal: parsed.data.goal,
    pathname: parsed.data.pathname ?? null,
    model: agentModel(),
  });
  return created({ run });
});

export const GET = withErrorBoundary(async () => {
  await requireAuth();
  return ok({ runs: await listRunsForUser(25) });
});
