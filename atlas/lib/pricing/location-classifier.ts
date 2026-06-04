/**
 * D-025b (auto-detect) — AI location-factor classifier.
 *
 * Given a single property address (optionally with coordinates / a Google
 * Maps URL), determine its pricing-relevant location factors so the engine
 * can match comps correctly WITHOUT the user hand-entering them:
 *   - waterfront_type   (sound_front_bluff | bayfront | inlet | inland)
 *   - view_premium      (none | partial | full)
 *   - town_proximity    (walkable | short_drive | remote)
 *   - lot_size_acres, year_built (best-effort; null when unverifiable)
 *
 * Method: geocode the address (Nominatim — free, already used by the quick-
 * price flow) for coordinates + town, then ask Claude (web_search beta with a
 * knowledge-only fallback) to read listings / county GIS / Maps geography for
 * THAT exact parcel. "Google Maps lookup" in practice = geocode + web search,
 * because the Maps/Places API itself does not expose waterfront status.
 *
 * The model is told to be conservative: default to "inland" + low confidence
 * rather than invent a waterfront classification.
 */

import { geocodeAddress } from './geocode';
import {
  coerceWaterfrontType,
  coerceViewPremium,
  coerceTownProximity,
  LOCATION_PROMPT_GUIDANCE,
  type WaterfrontType,
  type ViewPremium,
  type TownProximity,
} from './location-factors';
// V6.1.5 (V6.1.5-010) — Sonar location-classifier path (option-b dual-path)
import { callPerplexity, PerplexityError } from '@/lib/llm/perplexity-client';
import { LocationClassificationSchema } from '@/lib/llm/perplexity-schemas';
import { pricingProvider } from './provider';
import { promptHash } from './prompts';

const LOCATION_SYSTEM_PROMPT =
  'You are a real estate location analyst for the East End of Long Island (Hamptons, North Fork, Shelter Island), NY. Return only the requested JSON object — no prose outside it.';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface LocationClassifyInput {
  address: string;
  lat?: number | null;
  lng?: number | null;
  googleMapsUrl?: string | null;
  /** Optional human sub-market hint (e.g. "Sag Harbor"). */
  subMarketLabel?: string | null;
}

export interface LocationClassification {
  waterfrontType: WaterfrontType | null;
  viewPremium: ViewPremium | null;
  townProximity: TownProximity | null;
  lotSizeAcres: number | null;
  yearBuilt: number | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  usedWebSearch: boolean;
  /** Town/city resolved by the geocoder (helps the UI explain the result). */
  geocodedCity: string | null;
  error?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt
// ────────────────────────────────────────────────────────────────────────────

function buildPrompt(
  input: LocationClassifyInput,
  coords: { lat: number; lng: number } | null,
  city: string | null
): string {
  const lines = [
    `Address: ${input.address}`,
    coords ? `Coordinates: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : null,
    city ? `Town/city (geocoded): ${city}` : null,
    input.subMarketLabel ? `Sub-market hint: ${input.subMarketLabel}` : null,
    input.googleMapsUrl ? `Google Maps: ${input.googleMapsUrl}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return `You are a real estate location analyst for the East End of Long Island (the Hamptons, North Fork, Shelter Island, Sag Harbor / North Haven), NY. Determine the location factors for ONE specific property so an automated pricing engine can match comparable sales correctly.

SUBJECT PROPERTY:
${lines}

${LOCATION_PROMPT_GUIDANCE}

TASK: Using web search (Zillow, Realtor.com, county GIS / tax records, listing history, Google Maps satellite/geography) AND your geographic knowledge of the East End's bays, harbors, Long Island Sound, creeks/inlets, and village centers, classify this exact parcel:
- waterfront_type: does the PARCEL ITSELF directly abut water? sound_front_bluff (Sound/ocean-grade frontage or bluff) | bayfront (bay/harbor frontage) | inlet (creek/inlet frontage) | inland (no direct water frontage). A lot that merely has water NEARBY but does not abut it is "inland".
- view_premium: water/feature view FROM the home — none | partial | full.
- town_proximity: distance to the nearest village center / Main Street — walkable | short_drive | remote.
- lot_size_acres: acres from tax record / listing if found, else null.
- year_built: integer if found (existing structure), else null (vacant lot or planned build).

BE CONSERVATIVE AND HONEST. If you cannot verify direct water frontage, set waterfront_type to "inland" and confidence "low". Do NOT invent a waterfront classification to be helpful — a wrong class actively distorts pricing.

Return ONLY a JSON object — no markdown fences, no commentary:
{
  "waterfront_type": "bayfront",
  "view_premium": "partial",
  "town_proximity": "short_drive",
  "lot_size_acres": 0.92,
  "year_built": 2007,
  "confidence": "medium",
  "reasoning": "<1-2 sentences citing what you found: the water body it abuts (or that it is inland), approximate distance to the village, and the source if from a listing/GIS>"
}
Any field you cannot determine must be null (except confidence + reasoning, which are always required).`;
}

// ────────────────────────────────────────────────────────────────────────────
// Parsing (exported for unit testing)
// ────────────────────────────────────────────────────────────────────────────

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  const obj = text.match(/\{[\s\S]*\}/);
  return obj ? obj[0] : text;
}

export function parseLocationClassification(
  raw: string,
  opts: { usedWebSearch: boolean; geocodedCity: string | null }
): LocationClassification {
  const base: LocationClassification = {
    waterfrontType: null,
    viewPremium: null,
    townProximity: null,
    lotSizeAcres: null,
    yearBuilt: null,
    confidence: 'low',
    reasoning: '',
    usedWebSearch: opts.usedWebSearch,
    geocodedCity: opts.geocodedCity,
  };

  try {
    const parsed = JSON.parse(extractJson(raw)) as Record<string, unknown>;
    const lot = parsed.lot_size_acres;
    const year = parsed.year_built;
    const conf = String(parsed.confidence ?? 'low').toLowerCase();
    return {
      ...base,
      waterfrontType: coerceWaterfrontType(parsed.waterfront_type),
      viewPremium: coerceViewPremium(parsed.view_premium),
      townProximity: coerceTownProximity(parsed.town_proximity),
      lotSizeAcres:
        lot != null && Number.isFinite(Number(lot)) && Number(lot) >= 0 ? Number(lot) : null,
      yearBuilt:
        year != null &&
        Number.isFinite(Number(year)) &&
        Number(year) >= 1800 &&
        Number(year) <= 2100
          ? Math.round(Number(year))
          : null,
      confidence: conf === 'high' || conf === 'medium' ? conf : 'low',
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    };
  } catch {
    return { ...base, error: 'Could not parse location classification.' };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Anthropic call (mirrors comp-researcher's web_search + fallback pattern)
// ────────────────────────────────────────────────────────────────────────────

const MODEL_FALLBACK_CHAIN = [
  'claude-sonnet-4-5',
  'claude-3-7-sonnet-latest',
  'claude-3-5-sonnet-latest',
];

async function callAnthropic(
  apiKey: string,
  prompt: string,
  useWebSearch: boolean
): Promise<{ text: string; ok: boolean; status: number }> {
  // D-026(b) fix: web search is GA — no anthropic-beta header.
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };

  let lastStatus = 0;
  for (const model of MODEL_FALLBACK_CHAIN) {
    const body: Record<string, unknown> = {
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    };
    if (useWebSearch) {
      body.tools = [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          // Tight cap — classifying one parcel rarely needs >2 searches.
          max_uses: 3,
          user_location: {
            type: 'approximate',
            country: 'US',
            region: 'New York',
            timezone: 'America/New_York',
          },
        },
      ];
    }

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (resp.ok) {
      const data = (await resp.json()) as { content?: Array<{ type: string; text?: string }> };
      const text =
        data.content
          ?.filter(
            (c): c is { type: string; text: string } =>
              c.type === 'text' && typeof c.text === 'string'
          )
          .map((c) => c.text)
          .join('\n')
          .trim() ?? '';
      return { text, ok: true, status: resp.status };
    }

    lastStatus = resp.status;
    if (resp.status === 401 || resp.status === 403) break;
    if (resp.status !== 404) break;
  }
  return { text: '', ok: false, status: lastStatus };
}

// ────────────────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────────────────

/**
 * Classify a single property's location factors. Tries live web search first,
 * falls back to knowledge-only. Always returns a result object (never throws);
 * on failure returns an all-null classification with an `error` set.
 */
export async function classifyLocation(
  input: LocationClassifyInput,
  apiKey: string = '',
  opts?: { runId?: string }
): Promise<LocationClassification> {
  // 1. Geocode for coordinates + town (best-effort; helps the model + UI).
  let coords: { lat: number; lng: number } | null =
    input.lat != null && input.lng != null ? { lat: input.lat, lng: input.lng } : null;
  let city: string | null = null;
  try {
    const geo = await geocodeAddress(input.address);
    if (geo) {
      coords = coords ?? { lat: geo.lat, lng: geo.lng };
      city = geo.city;
    }
  } catch {
    // geocode is optional — proceed without it
  }

  const prompt = buildPrompt(input, coords, city);

  // V6.1.5 option-b: Sonar when PRICING_LLM_PROVIDER=perplexity; else Anthropic.
  if (pricingProvider() === 'perplexity') {
    return classifyLocationViaSonar(prompt, city, opts?.runId);
  }

  // 2. Web-search attempt.
  try {
    const { text, ok, status } = await callAnthropic(apiKey, prompt, true);
    if (ok && text.trim())
      return parseLocationClassification(text, { usedWebSearch: true, geocodedCity: city });
    // 400 = beta unavailable → fall through to knowledge-only; other errors → stop.
    if (status !== 400 && status !== 0) {
      const { text: t2, ok: ok2 } = await callAnthropic(apiKey, prompt, false);
      if (ok2 && t2.trim())
        return parseLocationClassification(t2, { usedWebSearch: false, geocodedCity: city });
      return {
        waterfrontType: null,
        viewPremium: null,
        townProximity: null,
        lotSizeAcres: null,
        yearBuilt: null,
        confidence: 'low',
        reasoning: '',
        usedWebSearch: false,
        geocodedCity: city,
        error: `Location classifier API error (HTTP ${status}).`,
      };
    }
  } catch {
    // fall through to knowledge-only
  }

  // 3. Knowledge-only fallback.
  try {
    const { text, ok, status } = await callAnthropic(apiKey, prompt, false);
    if (ok && text.trim())
      return parseLocationClassification(text, { usedWebSearch: false, geocodedCity: city });
    return {
      waterfrontType: null,
      viewPremium: null,
      townProximity: null,
      lotSizeAcres: null,
      yearBuilt: null,
      confidence: 'low',
      reasoning: '',
      usedWebSearch: false,
      geocodedCity: city,
      error: `Location classifier unavailable (HTTP ${status}).`,
    };
  } catch (err) {
    return {
      waterfrontType: null,
      viewPremium: null,
      townProximity: null,
      lotSizeAcres: null,
      yearBuilt: null,
      confidence: 'low',
      reasoning: '',
      usedWebSearch: false,
      geocodedCity: city,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// V6.1.5 (V6.1.5-010) — Sonar location classifier
//
// Reuses buildPrompt (as the user message) + parseLocationClassification (all
// the coercion). Fail-loud: a Sonar error returns an all-null classification
// with `error` set — the route's auto-detect catch degrades gracefully (the
// brief proceeds with whatever factors already exist). No Anthropic fallback.
// ────────────────────────────────────────────────────────────────────────────

async function classifyLocationViaSonar(
  prompt: string,
  city: string | null,
  runId: string = crypto.randomUUID()
): Promise<LocationClassification> {
  try {
    const hash = await promptHash(LOCATION_SYSTEM_PROMPT, prompt);
    const result = await callPerplexity<unknown>({
      systemPrompt: LOCATION_SYSTEM_PROMPT,
      userPrompt: prompt,
      model: 'sonar-pro',
      responseSchema: LocationClassificationSchema,
      callSite: 'location_classifier',
      runId,
      promptHash: hash,
    });
    // result.data is the guaranteed-shape JSON object; reuse the existing parser
    // (coerceWaterfrontType / coerceViewPremium / coerceTownProximity + null guards).
    return parseLocationClassification(JSON.stringify(result.data), {
      usedWebSearch: true,
      geocodedCity: city,
    });
  } catch (e) {
    const msg =
      e instanceof PerplexityError
        ? e.message
        : e instanceof Error
          ? e.message
          : 'Sonar location classifier failed';
    return {
      waterfrontType: null,
      viewPremium: null,
      townProximity: null,
      lotSizeAcres: null,
      yearBuilt: null,
      confidence: 'low',
      reasoning: '',
      usedWebSearch: false,
      geocodedCity: city,
      error: msg,
    };
  }
}
