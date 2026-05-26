/**
 * GET  /api/comps
 *   List comps (filterable). Authenticated users only.
 *   Query: ?subCutKey=...&status=closed|active|withdrawn|pending|any
 *          &isNc=true|false&limit=...&offset=...&includeArchived=true
 *
 * POST /api/comps
 *   Create a single comp. Editor or super_admin only.
 *   Body: NewCompSchema (zod).
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, created, badRequest, conflict } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import {
  createComp,
  listComps,
  CompDuplicateError,
  CompValidationError,
  type ListCompsFilter,
} from '@/lib/repos/comps';
import type { CompStatus } from '@/lib/db/schema/comps';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

const COMP_STATUSES = ['closed', 'active', 'withdrawn', 'pending'] as const;
const WATERFRONT = ['sound_front_bluff', 'bayfront', 'inlet', 'inland'] as const;
const SOURCES = ['manual', 'csv', 'mls_onekey', 'compass', 'outeast', 'other'] as const;

const NewCompSchema = z.object({
  address: z.string().min(1).max(500),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  subCutKey: z.string().min(1).max(100),
  waterfrontType: z.enum(WATERFRONT).optional().nullable(),
  isNc: z.boolean(),
  status: z.enum(COMP_STATUSES),
  closingDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'closingDate must be YYYY-MM-DD')
    .optional()
    .nullable(),
  salePriceCents: z.number().int().positive().optional().nullable(),
  agSqft: z.number().int().positive(),
  lotSizeAcres: z.number().nonnegative().optional().nullable(),
  yearBuilt: z.number().int().min(1800).max(2100).optional().nullable(),
  broker: z.string().max(200).optional().nullable(),
  sourceUrl: z.string().url().max(2000).optional().nullable(),
  source: z.enum(SOURCES).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export const GET = withErrorBoundary(async (req: NextRequest) => {
  await requireAuth();
  const sp = req.nextUrl.searchParams;
  const filter: ListCompsFilter = {};
  const subCutKey = sp.get('subCutKey');
  if (subCutKey) filter.subCutKey = subCutKey;
  const statusParam = sp.get('status');
  if (statusParam) filter.status = statusParam as CompStatus | 'any';
  const isNcParam = sp.get('isNc');
  if (isNcParam === 'true') filter.isNc = true;
  if (isNcParam === 'false') filter.isNc = false;
  filter.includeArchived = sp.get('includeArchived') === 'true';
  const limitParam = sp.get('limit');
  if (limitParam) filter.limit = Math.max(1, Math.min(500, Number.parseInt(limitParam, 10)));
  const offsetParam = sp.get('offset');
  if (offsetParam) filter.offset = Math.max(0, Number.parseInt(offsetParam, 10));
  const comps = await listComps(filter);
  return ok({ comps });
});

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);
  const json = await req.json().catch(() => null);
  const parsed = NewCompSchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }
  try {
    const comp = await createComp({ ...parsed.data, createdBy: user.id });
    return created({ comp });
  } catch (err) {
    if (err instanceof CompDuplicateError) return conflict(err.message, err.code);
    if (err instanceof CompValidationError) return badRequest(err.message, err.code);
    throw err;
  }
});
