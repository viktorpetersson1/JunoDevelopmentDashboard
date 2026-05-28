/**
 * POST /api/pricing/parse-url
 *
 * Parses a Google Maps URL (or plain address string) server-side and returns
 * the extracted address + optional coordinates.
 *
 * This is a tiny utility endpoint because:
 *   - Short URLs (goo.gl / maps.app.goo.gl) need a fetch redirect-follow,
 *     which is blocked in the browser by CORS.
 *   - After extracting an address, we can geocode it via Nominatim
 *     (browser→Nominatim is allowed, but batching the lookup here is cleaner).
 *
 * Auth: any authenticated user.
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { parseMapsUrl } from '@/lib/pricing/parse-maps-url';
import { geocodeAddress, inferSubCutFromCoords } from '@/lib/pricing/geocode';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

const BodySchema = z.object({
  input: z.string().min(1).max(2000),
});

export const POST = withErrorBoundary(async (req: NextRequest) => {
  await requireAuth();

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return badRequest('input is required', 'VALIDATION_FAILED');
  }

  const { input } = parsed.data;

  // 1. Parse the Maps URL (follows redirect for short URLs).
  const mapsResult = await parseMapsUrl(input);

  // 2. Geocode: use the extracted address if we have one; otherwise geocode
  //    the raw input as a plain address string.
  const addressToGeocode = mapsResult.address ?? input;
  let lat = mapsResult.lat;
  let lng = mapsResult.lng;
  let displayName: string | null = null;
  let city: string | null = null;
  let inferredSubCutKey: string | null = null;

  if (addressToGeocode && (lat === null || lng === null)) {
    const geo = await geocodeAddress(addressToGeocode);
    if (geo) {
      lat = geo.lat;
      lng = geo.lng;
      displayName = geo.displayName;
      city = geo.city;
    }
  }

  // 3. Infer sub-cut from coordinates.
  if (lat !== null && lng !== null) {
    inferredSubCutKey = inferSubCutFromCoords(lat, lng);
  }

  return ok({
    address: mapsResult.address ?? input,
    lat,
    lng,
    displayName,
    city,
    inferredSubCutKey,
  });
});
