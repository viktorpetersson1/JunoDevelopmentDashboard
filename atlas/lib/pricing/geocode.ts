/**
 * Address geocoding via Nominatim (OpenStreetMap).
 *
 * Free, no API key, edge-compatible. Nominatim's usage policy:
 *   - Set a descriptive User-Agent.
 *   - No bulk / heavy-batch use (this is fine — we geocode once per pricing run).
 *   - Max 1 req/sec (our on-demand flow is far below that).
 *
 * Returns null when the address cannot be geocoded or on network error.
 */

export interface GeocodedAddress {
  lat: number;
  lng: number;
  displayName: string;
  city: string | null;
  state: string | null;
  postcode: string | null;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    state?: string;
    postcode?: string;
  };
}

export async function geocodeAddress(address: string): Promise<GeocodedAddress | null> {
  if (!address.trim()) return null;

  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?q=${encodeURIComponent(address)}` +
    `&format=json&limit=1&addressdetails=1&countrycodes=us`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'JunoAtlas/1.0 (https://juno-atlas.pages.dev)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as NominatimResult[];
    const first = data[0];
    if (!first) return null;

    const city =
      first.address?.city ??
      first.address?.town ??
      first.address?.village ??
      first.address?.hamlet ??
      null;

    return {
      lat: parseFloat(first.lat),
      lng: parseFloat(first.lon),
      displayName: first.display_name,
      city,
      state: first.address?.state ?? null,
      postcode: first.address?.postcode ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Attempt to infer the most likely market sub-cut from a geocoded lat/lng on
 * the East End of Long Island. This is a bounding-box approximation — not a
 * polygon membership test. The user always gets to override via dropdown.
 *
 * Returns a sub-cut key string or null if coordinates are outside the known
 * East End bounding box.
 */
export function inferSubCutFromCoords(lat: number, lng: number): string | null {
  // Rough bounding box: East End of Long Island
  // Lat: ~40.6–41.2, Lng: -73.2 to -71.8
  if (lat < 40.6 || lat > 41.3 || lng < -73.3 || lng > -71.7) {
    return null; // outside East End
  }

  // North Fork: roughly lat > 41.0 and lng < -72.3
  if (lat >= 40.95 && lng > -72.65 && lng < -72.0) {
    return 'north_fork_inland'; // default North Fork sub-cut
  }

  // Shelter Island: ~40.88–40.93, -72.35 to -72.27
  if (lat >= 40.87 && lat <= 40.95 && lng >= -72.37 && lng <= -72.25) {
    return 'shelter_island';
  }

  // Hamptons sub-regions (southern fork)
  // East Hampton village: roughly lng -72.2 to -72.0
  if (lng >= -72.25 && lng < -72.0) {
    return 'east_hampton_village';
  }
  // Amagansett / Montauk: east of -72.1
  if (lng >= -72.1) {
    return 'montauk';
  }
  // Southampton village: -72.4 to -72.2
  if (lng >= -72.45 && lng < -72.25) {
    return 'southampton_village';
  }
  // Bridgehampton / Water Mill / Sagaponack: -72.6 to -72.4
  if (lng >= -72.65 && lng < -72.45) {
    return 'bridgehampton';
  }
  // Sag Harbor / North Haven: lng around -72.3, lat > 40.98
  if (lat >= 40.97 && lng >= -72.35 && lng < -72.25) {
    return 'sag_harbor';
  }

  // Fallback: generic Hamptons
  return 'east_hampton_village';
}
