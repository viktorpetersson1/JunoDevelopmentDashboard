/**
 * Parse a Google Maps URL (or plain address string) to extract the address
 * and/or coordinates.
 *
 * Handles the main URL shapes produced by the "Copy link" and "Share" actions:
 *   1. Place URL   — https://www.google.com/maps/place/ADDRESS/@lat,lng,zoom/…
 *   2. Query URL   — https://maps.google.com/?q=ADDRESS  or  ?q=lat,lng&ll=…
 *   3. Short URL   — https://goo.gl/maps/HASH  or  https://maps.app.goo.gl/HASH
 *      (followed server-side via fetch; not usable in the browser due to CORS)
 *   4. Raw string  — treated as a plain address if it isn't a URL.
 *
 * Any field that cannot be extracted is returned as null.
 */

export interface ParsedMapsUrl {
  address: string | null;
  lat: number | null;
  lng: number | null;
}

/** Parse a fully-resolved (non-short) Maps URL. Returns null if not a Maps URL. */
function parseDirectUrl(raw: string): ParsedMapsUrl | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    // Not a URL — treat as a plain address string.
    return { address: raw.trim() || null, lat: null, lng: null };
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');

  // Short URLs need the caller to follow the redirect first.
  if (host === 'goo.gl' || host === 'maps.app.goo.gl') {
    return null; // sentinel: follow-and-retry
  }

  // Not a Maps URL at all.
  if (host !== 'google.com' && host !== 'maps.google.com') {
    return { address: raw.trim(), lat: null, lng: null };
  }

  let address: string | null = null;
  let lat: number | null = null;
  let lng: number | null = null;

  // ── Path extraction ──────────────────────────────────────────────────────
  // Format 1: /maps/place/ENCODED_ADDRESS/@lat,lng,zoom
  const placeMatch = url.pathname.match(/\/maps\/place\/([^/@]+)/);
  if (placeMatch?.[1]) {
    address = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
    // Strip trailing punctuation artefacts (e.g. trailing comma)
    address = address.replace(/[,\s]+$/, '').trim() || null;
  }

  // @lat,lng,zoom in pathname
  const coordMatch = url.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (coordMatch?.[1] && coordMatch?.[2]) {
    lat = parseFloat(coordMatch[1]);
    lng = parseFloat(coordMatch[2]);
  }

  // ── Query-string extraction ──────────────────────────────────────────────
  const qParam = url.searchParams.get('q');
  if (qParam) {
    const latLngOnly = qParam.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
    if (latLngOnly?.[1] && latLngOnly?.[2]) {
      lat = lat ?? parseFloat(latLngOnly[1]);
      lng = lng ?? parseFloat(latLngOnly[2]);
    } else if (!address) {
      address = qParam.trim() || null;
    }
  }

  const llParam = url.searchParams.get('ll');
  if (llParam) {
    const llMatch = llParam.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
    if (llMatch?.[1] && llMatch?.[2]) {
      lat = lat ?? parseFloat(llMatch[1]);
      lng = lng ?? parseFloat(llMatch[2]);
    }
  }

  return { address, lat, lng };
}

/**
 * Parse a Google Maps URL or address string.
 *
 * For short URLs (goo.gl / maps.app.goo.gl) this follows the redirect using
 * a server-side `fetch` — call this from a Route Handler, NOT from client JS.
 */
export async function parseMapsUrl(input: string): Promise<ParsedMapsUrl> {
  const trimmed = input.trim();
  if (!trimmed) return { address: null, lat: null, lng: null };

  const direct = parseDirectUrl(trimmed);
  if (direct !== null) return direct;

  // Short URL — follow the redirect and re-parse the resolved URL.
  try {
    const resp = await fetch(trimmed, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': 'JunoAtlas/1.0' },
    });
    if (resp.url && resp.url !== trimmed) {
      const fromResolved = parseDirectUrl(resp.url);
      if (fromResolved !== null) return fromResolved;
    }
  } catch {
    // Network error — fall through.
  }

  // Best-effort: return the raw input as an address (user typed an address, not a URL).
  return { address: trimmed, lat: null, lng: null };
}
