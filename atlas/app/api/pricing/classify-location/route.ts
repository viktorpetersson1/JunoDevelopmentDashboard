/**
 * POST /api/pricing/classify-location
 *
 * D-025b (auto-detect) — infer a property's location factors (waterfront
 * class, view, town proximity, lot size, year built) from its address.
 *
 * Used by the new-project wizard's "Detect from address" button to pre-fill
 * the location-factor selects (the user can override). The brief route calls
 * the underlying classifyLocation() directly for its auto-fill path.
 *
 * Auth: editor or super_admin (consumes API credits).
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { classifyLocation } from '@/lib/pricing/location-classifier';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

const RequestSchema = z.object({
  address: z.string().min(3).max(500),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  googleMapsUrl: z.string().url().max(2000).nullable().optional(),
  subMarketLabel: z.string().max(200).nullable().optional(),
});

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const { profile } = await requireAuth();
  requireEditor(profile);

  const json = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation: ${parsed.error.issues.map((i) => `${i.path.join('.')} — ${i.message}`).join('; ')}`,
      'VALIDATION_FAILED'
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return badRequest(
      'ANTHROPIC_API_KEY is not configured — location auto-detect unavailable.',
      'NO_API_KEY'
    );
  }

  const classification = await classifyLocation(parsed.data, apiKey);
  return ok({ classification });
});
