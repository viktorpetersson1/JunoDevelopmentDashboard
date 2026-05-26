/**
 * GET    /api/comps/[id]   — fetch one.
 * PATCH  /api/comps/[id]   — update fields (address NOT editable; archive + recreate).
 * DELETE /api/comps/[id]   — archive (hides from library; snapshots unaffected).
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest, notFound, conflict } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import {
  archiveComp,
  findCompById,
  updateComp,
  CompDuplicateError,
  CompValidationError,
} from '@/lib/repos/comps';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

const COMP_STATUSES = ['closed', 'active', 'withdrawn', 'pending'] as const;
const WATERFRONT = ['sound_front_bluff', 'bayfront', 'inlet', 'inland'] as const;

const UpdateCompSchema = z
  .object({
    subCutKey: z.string().min(1).max(100).optional(),
    waterfrontType: z.enum(WATERFRONT).nullable().optional(),
    isNc: z.boolean().optional(),
    status: z.enum(COMP_STATUSES).optional(),
    closingDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    salePriceCents: z.number().int().positive().nullable().optional(),
    agSqft: z.number().int().positive().optional(),
    lotSizeAcres: z.number().nonnegative().nullable().optional(),
    yearBuilt: z.number().int().min(1800).max(2100).nullable().optional(),
    broker: z.string().max(200).nullable().optional(),
    sourceUrl: z.string().url().max(2000).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const GET = withErrorBoundary(async (_req: NextRequest, ctx: RouteContext) => {
  await requireAuth();
  const comp = await findCompById(ctx.params.id);
  if (!comp) return notFound(`Comp "${ctx.params.id}" not found`, 'COMP_NOT_FOUND');
  return ok({ comp });
});

export const PATCH = withErrorBoundary(async (req: NextRequest, ctx: RouteContext) => {
  const { profile } = await requireAuth();
  requireEditor(profile);
  const existing = await findCompById(ctx.params.id);
  if (!existing) return notFound(`Comp "${ctx.params.id}" not found`, 'COMP_NOT_FOUND');
  const json = await req.json().catch(() => null);
  const parsed = UpdateCompSchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }
  try {
    const comp = await updateComp(ctx.params.id, parsed.data);
    return ok({ comp });
  } catch (err) {
    if (err instanceof CompDuplicateError) return conflict(err.message, err.code);
    if (err instanceof CompValidationError) return badRequest(err.message, err.code);
    throw err;
  }
});

export const DELETE = withErrorBoundary(async (_req: NextRequest, ctx: RouteContext) => {
  const { profile } = await requireAuth();
  requireEditor(profile);
  const existing = await findCompById(ctx.params.id);
  if (!existing) return notFound(`Comp "${ctx.params.id}" not found`, 'COMP_NOT_FOUND');
  await archiveComp(ctx.params.id);
  return ok({ id: ctx.params.id, status: 'archived' });
});
