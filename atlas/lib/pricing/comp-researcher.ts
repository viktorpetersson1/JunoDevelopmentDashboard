/**
 * AI-powered comp researcher for the East End of Long Island pricing framework.
 *
 * Primary path: Anthropic Messages API with the web_search beta enabled —
 * Claude searches Zillow, Realtor.com, Out East, Sotheby's International,
 * Compass, and Douglas Elliman for recent comparable sales in real time.
 *
 * Fallback: if the web_search beta returns an error (or the API key is
 * misconfigured), Claude answers from its training-data knowledge base.
 * Knowledge-based comps are marked confidence: "estimated" in the output.
 *
 * Callers should display a clear banner when any comps are "estimated" so
 * users know they need to verify with live MLS data before committing.
 */

import {
  coerceWaterfrontType,
  subjectLocationLines,
  LOCATION_PROMPT_GUIDANCE,
  type WaterfrontType,
  type ViewPremium,
  type TownProximity,
} from './location-factors';
// ── V6.1.5 (T-PRC-2) — Perplexity Sonar path (option-b dual-path) ───────────
import { callPerplexity, PerplexityError, type PerplexityCitation } from '@/lib/llm/perplexity-client';
import { CompResearchSchema } from '@/lib/llm/perplexity-schemas';
import { CompResearchDataSchema, type CompResearchData, type SonarComp } from './schemas';
import { pricingProvider, compSearchDomains } from './provider';
import {
  renderTemplate,
  promptHash,
  SYSTEM_BASE_PROMPT,
  COMP_RESEARCH_USER_TEMPLATE,
} from './prompts';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface CompResearchInput {
  address: string;
  /** Human-readable sub-cut label shown to the model (e.g. "East Hampton Village"). */
  subCutLabel: string;
  /** Above-grade square footage of the subject property. */
  agSqft: number;
  lotSizeAcres?: number | null;
  yearBuilt?: number | null;
  isNc: boolean;
  // ── Location factors (D-025b) — subject's profile so the model matches
  //    like-for-like and doesn't let an off-class comp set the median. ──
  waterfrontType?: WaterfrontType | null;
  viewPremium?: ViewPremium | null;
  townProximity?: TownProximity | null;
  /** Lookback window in months. Default 18. */
  compWindowMonths?: number;
}

export interface ResearchedComp {
  address: string;
  salePriceUsd: number;
  agSqft: number;
  closingDate: string | null; // YYYY-MM-DD
  status: 'closed' | 'active';
  yearBuilt: number | null;
  lotSizeAcres: number | null;
  /** D-025b: waterfront class as classified by the model (null if unknown). */
  waterfrontType: WaterfrontType | null;
  isNewConstruction: boolean;
  /** Days on market (listing → contract/closing). Null when unknown. */
  domDays: number | null;
  sourceUrl: string | null;
  sourceName: string;
  psf: number;
  confidence: 'confirmed' | 'estimated';
  notes: string | null;
  /** V6.1.5 stuck-listing signal — populated by the Sonar path only. */
  relistCount?: number | null;
  firstListedAt?: string | null; // YYYY-MM-DD
}

export interface CompResearchOutput {
  comps: ResearchedComp[];
  dataGap: boolean; // true when fewer than 3 closed comps returned
  confidence: 'high' | 'medium' | 'low';
  sourcesSearched: string[];
  narrativeSummary: string;
  usedWebSearch: boolean;
  error?: string;
  /** V6.1.5 (Sonar path): top-level citations[], sub-cut definition, gap severity. */
  citations?: PerplexityCitation[];
  subCutDefinition?: string;
  dataGapSeverity?: 'none' | 'amber' | 'red';
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt builder
// ────────────────────────────────────────────────────────────────────────────

function buildPrompt(input: CompResearchInput, knowledgeOnly: boolean): string {
  const window = input.compWindowMonths ?? 18;
  const locationLines = subjectLocationLines({
    waterfrontType: input.waterfrontType,
    viewPremium: input.viewPremium,
    townProximity: input.townProximity,
    lotSizeAcres: input.lotSizeAcres,
    yearBuilt: input.yearBuilt,
  });
  const desc = [
    `Address: ${input.address}`,
    `Sub-market: ${input.subCutLabel} (East End of Long Island, NY)`,
    `Above-grade sq ft: ${input.agSqft.toLocaleString()} SF`,
    locationLines || null,
    `Property type: ${input.isNc ? 'New construction (recently built)' : 'Resale (existing home)'}`,
  ]
    .filter(Boolean)
    .join('\n');

  // D-025b — waterfront is the dominant PSF driver; steer the model hard.
  const waterfrontCriterion = input.waterfrontType
    ? `0. WATERFRONT CLASS (HIGHEST PRIORITY): the subject is "${input.waterfrontType}". Strongly prefer comps in the SAME waterfront class. If you include a different-class comp for context, set its "waterfront_type" honestly, flag it as off-class in "notes", and do NOT let it set the median or the headline $/SF.`
    : `0. WATERFRONT CLASS: the subject's waterfront class is not provided — infer it from the address where possible. Classify every comp's "waterfront_type" and assume inland if no water access is evident.`;

  const searchInstruction = knowledgeOnly
    ? `Use your knowledge of the Hamptons / East End real estate market. Mark all comps with confidence: "estimated" since this is not from live MLS data. Prefer the most recent comps you have credible knowledge of. If you have NO credible specific comps for this sub-market, return an empty comps array rather than fabricating addresses.`
    : `Search Zillow.com, Realtor.com, Out East (outeast.com), Sotheby's International Realty (sothebysrealty.com), Compass (compass.com), Douglas Elliman (elliman.com), and Bespoke (bespokerealestate.com) for recent sales data. Only return comps with addresses you can verify via search results. Mark each comp's source_url with the actual URL you found it at.`;

  return `You are a real estate comp researcher for the East End of Long Island (Hamptons, North Fork, Shelter Island), NY. Your output drives an IC pricing decision — accuracy and honest sourcing matter more than coverage.

SUBJECT PROPERTY:
${desc}

${LOCATION_PROMPT_GUIDANCE}

TASK: Find comparable residential sales to support exit pricing analysis.

${searchInstruction}

SEARCH CRITERIA:
${waterfrontCriterion}
1. CLOSED sales in ${input.subCutLabel} within the last ${window} months — highest priority.
2. ACTIVE/PENDING listings in ${input.subCutLabel} — these set the price ceiling.
3. Size range: within ±35% of ${input.agSqft.toLocaleString()} SF.
4. Construction type MUST match: ${input.isNc ? 'new construction ONLY (completed 2020 or later, or explicitly listed as new construction). Do NOT include resales.' : 'resale / existing homes ONLY. Do NOT include new construction.'}
5. Minimum 3 closed comps; include 1–3 active listings as ceiling indicators.

CLASSIFICATION:
- waterfront_type: classify each comp as one of sound_front_bluff | bayfront | inlet | inland (use "inland" when there is no water access).
- New construction: built 2020 or later, OR listing explicitly says "new construction" / "newly built".
- Resale: all other sales.

Return ONLY a valid JSON object — no markdown fences, no explanation text outside the JSON:
{
  "comps": [
    {
      "address": "123 Ocean View Rd, East Hampton, NY 11937",
      "sale_price_usd": 3200000,
      "ag_sqft": 5100,
      "closing_date": "2024-09-12",
      "status": "closed",
      "year_built": 2023,
      "lot_size_acres": 1.2,
      "waterfront_type": "bayfront",
      "is_new_construction": true,
      "dom_days": 87,
      "source_url": "https://www.zillow.com/homedetails/...",
      "source_name": "Zillow",
      "psf": 627.45,
      "confidence": "confirmed",
      "notes": null
    }
  ],
  "sources_searched": ["Zillow", "Realtor.com", "Out East", "Sotheby's International", "Compass"],
  "narrative_summary": "Found 4 closed NC comps in East Hampton Village with PSF range $580–$720..."
}

RULES:
- psf = sale_price_usd / ag_sqft (always provide this field).
- closing_date must be YYYY-MM-DD or null.
- status must be "closed" or "active".
- waterfront_type must be one of: sound_front_bluff, bayfront, inlet, inland (best inference; "inland" if unsure).
- dom_days = days on market (listing → contract/closing). If you can find or estimate it, provide an integer; otherwise null.
- Sort output: closed comps first (newest first), then active listings.
- If you cannot find 3+ real comps, include best-knowledge estimates with confidence: "estimated".
- If no data exists for this area, return comps: [] with an explanation in narrative_summary.`;
}

// ────────────────────────────────────────────────────────────────────────────
// Response parsing
// ────────────────────────────────────────────────────────────────────────────

function extractJson(text: string): string {
  // Strip markdown code fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  // Find outermost JSON object
  const obj = text.match(/\{[\s\S]*\}/);
  return obj ? obj[0] : text;
}

function parseResponse(raw: string, usedWebSearch: boolean): CompResearchOutput {
  try {
    const jsonStr = extractJson(raw);
    const parsed = JSON.parse(jsonStr) as {
      comps?: unknown[];
      sources_searched?: unknown[];
      narrative_summary?: unknown;
    };

    const rawComps = Array.isArray(parsed.comps) ? parsed.comps : [];
    const comps: ResearchedComp[] = rawComps
      .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
      .map((c) => {
        const salePriceUsd = Number(c.sale_price_usd ?? 0);
        const agSqft = Number(c.ag_sqft ?? 0);
        const psfRaw = Number(c.psf ?? 0);
        const psf = psfRaw > 0 ? psfRaw : agSqft > 0 ? salePriceUsd / agSqft : 0;
        return {
          address: String(c.address ?? '').trim(),
          salePriceUsd,
          agSqft,
          closingDate: c.closing_date ? String(c.closing_date) : null,
          status: (c.status === 'active' ? 'active' : 'closed') as 'closed' | 'active',
          yearBuilt: c.year_built ? Number(c.year_built) : null,
          lotSizeAcres: c.lot_size_acres ? Number(c.lot_size_acres) : null,
          waterfrontType: coerceWaterfrontType(c.waterfront_type),
          isNewConstruction: Boolean(c.is_new_construction),
          domDays:
            c.dom_days !== undefined && c.dom_days !== null
              ? Math.max(0, Math.round(Number(c.dom_days)))
              : null,
          sourceUrl: c.source_url ? String(c.source_url) : null,
          sourceName: String(c.source_name ?? 'AI Research'),
          psf: Math.round(psf * 100) / 100,
          confidence: (c.confidence === 'confirmed' ? 'confirmed' : 'estimated') as
            | 'confirmed'
            | 'estimated',
          notes: c.notes ? String(c.notes) : null,
        };
      })
      .filter((c) => c.address && c.agSqft > 0 && c.salePriceUsd > 0);

    const closedCount = comps.filter((c) => c.status === 'closed').length;
    const confidence: 'high' | 'medium' | 'low' =
      closedCount >= 5 ? 'high' : closedCount >= 3 ? 'medium' : 'low';

    return {
      comps,
      dataGap: closedCount < 3,
      confidence,
      sourcesSearched: Array.isArray(parsed.sources_searched)
        ? parsed.sources_searched.map(String)
        : [],
      narrativeSummary: String(parsed.narrative_summary ?? 'Comp research complete.'),
      usedWebSearch,
    };
  } catch {
    return {
      comps: [],
      dataGap: true,
      confidence: 'low',
      sourcesSearched: [],
      narrativeSummary: 'Unable to parse comp research results.',
      usedWebSearch,
      error: 'Response could not be parsed as structured comp data',
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Anthropic API helpers
// ────────────────────────────────────────────────────────────────────────────

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicResponseBody {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  error?: { type: string; message: string };
}

/**
 * Model fallback chain — try newest first, fall back to older stable releases
 * if Anthropic returns 404 (model deprecated). Pinning to a single concrete
 * model id stopped working when claude-3-5-sonnet-20241022 was retired in
 * 2026; -latest aliases + a fallback chain prevents that recurrence.
 */
const MODEL_FALLBACK_CHAIN = [
  'claude-sonnet-4-5',
  'claude-3-7-sonnet-latest',
  'claude-3-5-sonnet-latest',
];

async function callAnthropic(
  apiKey: string,
  messages: AnthropicMessage[],
  options: {
    maxTokens?: number;
    useWebSearch?: boolean;
  } = {}
): Promise<{ text: string; ok: boolean; status: number; modelUsed: string | null }> {
  const { maxTokens = 4096, useWebSearch = false } = options;

  // D-026(b) fix: web search is GA — NO anthropic-beta header. Sending the
  // old `web-search-2025-02-14` beta header 400'd every call, which our
  // 400-handler silently dropped to knowledge-only fallback (so every
  // brief / comp insert was stale 2024 training data, not live MLS).
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };

  let lastStatus = 0;
  for (const model of MODEL_FALLBACK_CHAIN) {
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages,
    };
    if (useWebSearch) {
      body.tools = [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          // Cost cap: $10/1000 searches. Comp research may do 3-4
          // parallel queries (closed vs active across multiple sites);
          // 5 is enough headroom without blowing the budget.
          max_uses: 5,
          // East End is hyper-local; NY localization sharpens results
          // (Zillow / Realtor surface different listings by region).
          user_location: {
            type: 'approximate',
            country: 'US',
            region: 'New York',
            timezone: 'America/New_York',
          },
        },
      ];
      // tool_choice intentionally omitted — auto is the default for
      // server tools; setting it explicitly is not in any current docs
      // example and adds nothing.
    }

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (resp.ok) {
      const data = (await resp.json()) as AnthropicResponseBody;
      const text =
        data.content
          ?.filter(
            (c): c is { type: string; text: string } =>
              c.type === 'text' && typeof c.text === 'string'
          )
          .map((c) => c.text)
          .join('\n')
          .trim() ?? '';
      return { text, ok: true, status: resp.status, modelUsed: model };
    }

    lastStatus = resp.status;
    // 404 = model not found → fall through to next candidate.
    // 401/403 = auth issue → no point trying others.
    if (resp.status === 401 || resp.status === 403) break;
    // Any other non-ok also stops the loop (server error etc.).
    if (resp.status !== 404) break;
  }

  return { text: '', ok: false, status: lastStatus, modelUsed: null };
}

// ────────────────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────────────────

/**
 * Research comparable sales for a subject property.
 *
 * Tries live web search first (Anthropic beta); falls back to training-data
 * knowledge if the beta is unavailable or the API call fails.
 */
// ────────────────────────────────────────────────────────────────────────────
// Market sampling — no subject property; general "what's happening in this
// sub-market?" research. Used by the /pricing dashboard to bootstrap the
// comp library before any project briefs have run.
// ────────────────────────────────────────────────────────────────────────────

export interface MarketResearchInput {
  /** Human-readable sub-cut label (e.g. "Sag Harbor — Hamptons"). */
  subCutLabel: string;
  /** How far back to look for closed sales (months). Default 12. */
  windowMonths?: number;
  /** Max closed sales to return. Default 8. */
  maxClosed?: number;
  /** Max active listings to return. Default 4. */
  maxActive?: number;
}

function buildMarketResearchPrompt(input: MarketResearchInput): string {
  const window = input.windowMonths ?? 12;
  const maxClosed = input.maxClosed ?? 8;
  const maxActive = input.maxActive ?? 4;

  return `You are researching residential sales activity in a sub-market on the East End of Long Island (Hamptons / North Fork / Shelter Island), NY. This is general market intelligence — NOT pricing for a specific subject property.

SUB-MARKET: ${input.subCutLabel}

Search Zillow, Realtor.com, Out East (outeast.com), Sotheby's International, Compass, Douglas Elliman, and Bespoke for sales activity.

TASK:
- Return up to ${maxClosed} CLOSED sales from the last ${window} months in ${input.subCutLabel}. Diversify across price/size/age.
- Return up to ${maxActive} ACTIVE listings currently on market in ${input.subCutLabel}.
- Prefer real verifiable comps; if you don't have credible data, return fewer comps rather than fabricating.
- Include diverse points — don't cluster around a single price range.

Return ONLY a valid JSON object — no markdown fences, no explanation:
{
  "comps": [
    {
      "address": "123 Ocean View Rd, East Hampton, NY 11937",
      "sale_price_usd": 3200000,
      "ag_sqft": 5100,
      "closing_date": "2024-09-12",
      "status": "closed",
      "year_built": 2023,
      "lot_size_acres": 1.2,
      "waterfront_type": "bayfront",
      "is_new_construction": true,
      "dom_days": 87,
      "source_url": "https://www.zillow.com/homedetails/...",
      "source_name": "Zillow",
      "psf": 627.45,
      "confidence": "confirmed",
      "notes": null
    }
  ],
  "sources_searched": ["Zillow", "Realtor.com", "Out East", "Sotheby's", "Compass"],
  "narrative_summary": "Sampled 6 closed and 3 active in ${input.subCutLabel} over the last ${window} months. Price range $X-$Y, $/SF range..."
}

RULES:
- psf = sale_price_usd / ag_sqft (always provide this).
- closing_date must be YYYY-MM-DD or null.
- status must be "closed" or "active".
- waterfront_type must be one of: sound_front_bluff, bayfront, inlet, inland (classify each comp; "inland" if no water access).
- dom_days = days on market (integer or null).
- If you have no credible data for ${input.subCutLabel}, return comps: [] with a clear narrative_summary explaining why.
- Output ONLY the JSON object. No markdown fences. No commentary.`;
}

/**
 * Sample recent sales activity in a sub-market — no subject property anchor.
 * Used by the /pricing dashboard's market-data refresh action to bootstrap
 * the comp library before any project briefs have run.
 */
export async function researchMarketActivity(
  input: MarketResearchInput,
  apiKey: string = '',
  opts?: { runId?: string }
): Promise<CompResearchOutput> {
  // V6.1.5 option-b: Sonar when the provider flag is 'perplexity'; else the
  // existing Anthropic path stays live (default).
  if (pricingProvider() === 'perplexity') {
    return researchMarketActivityViaSonar(input, opts);
  }

  // Attempt 1: live web search.
  try {
    const { text, ok, status } = await callAnthropic(
      apiKey,
      [{ role: 'user', content: buildMarketResearchPrompt(input) }],
      { useWebSearch: true }
    );
    if (ok && text.trim()) return parseResponse(text, true);
    if (status === 400) {
      // beta unavailable, fall through to knowledge mode
    } else if (!ok) {
      return {
        comps: [],
        dataGap: true,
        confidence: 'low',
        sourcesSearched: [],
        narrativeSummary: `Market research for ${input.subCutLabel} returned ${status}.`,
        usedWebSearch: false,
        error: `Anthropic API error (HTTP ${status})`,
      };
    }
  } catch {
    // network error → fall through
  }

  // Attempt 2: knowledge-only.
  try {
    const knowledgePrompt =
      buildMarketResearchPrompt(input) +
      '\n\nNote: Use your training-data knowledge. All comps must be marked confidence: "estimated".';
    const { text, ok, status } = await callAnthropic(
      apiKey,
      [{ role: 'user', content: knowledgePrompt }],
      { useWebSearch: false }
    );
    if (ok && text.trim()) return parseResponse(text, false);
    return {
      comps: [],
      dataGap: true,
      confidence: 'low',
      sourcesSearched: [],
      narrativeSummary: `Market research for ${input.subCutLabel} unavailable.`,
      usedWebSearch: false,
      error: `Anthropic API error (HTTP ${status})`,
    };
  } catch (err) {
    return {
      comps: [],
      dataGap: true,
      confidence: 'low',
      sourcesSearched: [],
      narrativeSummary: `Market research for ${input.subCutLabel} unavailable.`,
      usedWebSearch: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function researchComps(
  input: CompResearchInput,
  apiKey: string = '',
  opts?: { runId?: string }
): Promise<CompResearchOutput> {
  // V6.1.5 option-b: Sonar when the provider flag is 'perplexity'; else the
  // existing Anthropic path stays live (default).
  if (pricingProvider() === 'perplexity') {
    return researchCompsViaSonar(input, opts);
  }

  // ── Attempt 1: web_search beta ──────────────────────────────────────────
  try {
    const { text, ok, status } = await callAnthropic(
      apiKey,
      [{ role: 'user', content: buildPrompt(input, false) }],
      { useWebSearch: true }
    );

    if (ok && text.trim()) {
      return parseResponse(text, true);
    }

    // 400 = feature not available / beta header rejected — skip to fallback.
    if (status === 400) {
      // fall through
    } else if (!ok) {
      return {
        comps: [],
        dataGap: true,
        confidence: 'low',
        sourcesSearched: [],
        narrativeSummary: 'Comp research service returned an error.',
        usedWebSearch: false,
        error: `Anthropic API error (HTTP ${status})`,
      };
    }
  } catch {
    // Network / timeout — fall through to knowledge fallback.
  }

  // ── Attempt 2: knowledge-only fallback ───────────────────────────────────
  try {
    const { text, ok, status } = await callAnthropic(
      apiKey,
      [{ role: 'user', content: buildPrompt(input, true) }],
      { useWebSearch: false }
    );

    if (ok && text.trim()) {
      return parseResponse(text, false);
    }

    return {
      comps: [],
      dataGap: true,
      confidence: 'low',
      sourcesSearched: [],
      narrativeSummary: 'Comp research is temporarily unavailable.',
      usedWebSearch: false,
      error: `Anthropic API error (HTTP ${status})`,
    };
  } catch (err) {
    return {
      comps: [],
      dataGap: true,
      confidence: 'low',
      sourcesSearched: [],
      narrativeSummary: 'Comp research is temporarily unavailable.',
      usedWebSearch: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// V6.1.5 (T-PRC-2) — Perplexity Sonar implementation
//
// Fail-loud: a Sonar error surfaces in CompResearchOutput.error (the adapter
// already wrote a 'failed' pricing_llm_calls row) and NEVER falls back to
// Anthropic (Hard Rule #2). The caller surfaces a StatusDot (T-PRC-3 UI).
// ────────────────────────────────────────────────────────────────────────────

function windowDates(windowMonths: number): { after: string; before: string } {
  const now = new Date();
  const before = now.toISOString().slice(0, 10);
  const past = new Date(now);
  past.setMonth(past.getMonth() - windowMonths);
  const after = past.toISOString().slice(0, 10);
  return { after, before };
}

/**
 * sound|bay|ocean|none|creek (Sonar) → comps waterfront class. 'ocean' → null
 * (the comps enum has no ocean class — untag rather than mis-tag).
 */
function mapSonarWaterfront(w: string | undefined): WaterfrontType | null {
  const m: Record<string, string> = {
    sound: 'sound_front_bluff',
    bay: 'bayfront',
    creek: 'inlet',
    none: 'inland',
  };
  return coerceWaterfrontType(w ? (m[w] ?? w) : null);
}

function deriveSourceName(url: string | undefined): string {
  if (!url) return 'Sonar';
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const first = host.split('.')[0] ?? '';
    return first ? first.charAt(0).toUpperCase() + first.slice(1) : 'Sonar';
  } catch {
    return 'Sonar';
  }
}

function sonarCompToResearched(c: SonarComp): ResearchedComp {
  const agSqft = c.ag_sqft;
  const salePriceUsd = c.price_usd;
  // Stop-and-ask rule: never trust the LLM's price_per_sqft — recompute from
  // price_usd / ag_sqft and use the computed value.
  const psf = agSqft > 0 ? Math.round((salePriceUsd / agSqft) * 100) / 100 : 0;
  return {
    address: c.address.trim(),
    salePriceUsd,
    agSqft,
    closingDate: c.sale_date ?? null,
    status: c.status === 'closed' ? 'closed' : 'active',
    yearBuilt: null,
    lotSizeAcres: c.attributes?.acreage ?? null,
    waterfrontType: mapSonarWaterfront(c.attributes?.waterfront),
    isNewConstruction: c.attributes?.construction === 'new',
    domDays: c.dom_days ?? null,
    sourceUrl: c.source_url ?? null,
    sourceName: deriveSourceName(c.source_url),
    psf,
    // Sonar comps come from live web search with a verifiable source_url.
    confidence: 'confirmed',
    notes: null,
    relistCount: c.relist_count ?? 0,
    firstListedAt: c.first_listed_at ?? null,
  };
}

function sonarErrorOutput(error: string): CompResearchOutput {
  return {
    comps: [],
    dataGap: true,
    confidence: 'low',
    sourcesSearched: [],
    narrativeSummary: 'Sonar comp research unavailable.',
    usedWebSearch: false,
    error,
  };
}

function mapCompResearchData(
  data: CompResearchData,
  citations: PerplexityCitation[]
): CompResearchOutput {
  const comps = [...data.closed, ...data.active]
    .map(sonarCompToResearched)
    .filter((c) => c.address && c.agSqft > 0 && c.salePriceUsd > 0);
  const closedCount = comps.filter((c) => c.status === 'closed').length;
  const confidence: 'high' | 'medium' | 'low' =
    closedCount >= 5 ? 'high' : closedCount >= 3 ? 'medium' : 'low';
  const severity = data.data_gap_severity ?? (closedCount < 3 ? 'red' : 'none');
  const sources = Array.from(
    new Set(
      citations.map((c) => {
        try {
          return new URL(c.url).hostname.replace(/^www\./, '');
        } catch {
          return c.url;
        }
      })
    )
  ).slice(0, 12);
  return {
    comps,
    dataGap: closedCount < 3 || severity === 'red',
    confidence,
    sourcesSearched: sources,
    narrativeSummary: data.framework_notes || 'Sonar comp research complete.',
    usedWebSearch: true,
    citations,
    subCutDefinition: data.sub_cut_definition,
    dataGapSeverity: severity,
  };
}

async function researchCompsViaSonar(
  input: CompResearchInput,
  opts?: { runId?: string }
): Promise<CompResearchOutput> {
  const windowMonths = input.compWindowMonths ?? 24;
  const runId = opts?.runId ?? crypto.randomUUID();
  const userPrompt = renderTemplate(COMP_RESEARCH_USER_TEMPLATE, {
    address: input.address,
    ag_sqft: input.agSqft,
    bedrooms: '', // CompResearchInput carries no bedroom count; the model infers from listings
    waterfront: input.waterfrontType ?? 'unspecified (infer from the address)',
    sub_cut_definition: input.subCutLabel,
    window_months: windowMonths,
  });
  const hash = await promptHash(SYSTEM_BASE_PROMPT, COMP_RESEARCH_USER_TEMPLATE);
  const { after, before } = windowDates(windowMonths);

  try {
    const result = await callPerplexity<unknown>({
      systemPrompt: SYSTEM_BASE_PROMPT,
      userPrompt,
      model: 'sonar-pro',
      responseSchema: CompResearchSchema,
      searchDomainFilter: compSearchDomains(),
      searchAfterDate: after,
      searchBeforeDate: before,
      callSite: 'comp_research',
      runId,
      promptHash: hash,
    });
    const parsed = CompResearchDataSchema.safeParse(result.data);
    if (!parsed.success) {
      return sonarErrorOutput(
        `Sonar comp_research failed schema validation: ${parsed.error.issues[0]?.message ?? 'shape drift'}`
      );
    }
    return mapCompResearchData(parsed.data, result.citations);
  } catch (e) {
    const msg =
      e instanceof PerplexityError ? e.message : e instanceof Error ? e.message : 'Sonar comp research failed';
    return sonarErrorOutput(msg);
  }
}

async function researchMarketActivityViaSonar(
  input: MarketResearchInput,
  opts?: { runId?: string }
): Promise<CompResearchOutput> {
  const windowMonths = input.windowMonths ?? 12;
  const runId = opts?.runId ?? crypto.randomUUID();
  // Secondary "what's happening in this sub-market" research (narrative context,
  // not band derivation). Thin inline user ask; the framework system prompt
  // stays in the file (D-070). Broader recency than the subject comp pull.
  const userPrompt = `Sample recent sales activity in this East End sub-market for narrative market context (not a specific subject property):

- Sub-market: ${input.subCutLabel}

Return up to ${input.maxClosed ?? 8} CLOSED sales from the last ${windowMonths} months and up to ${input.maxActive ?? 4} ACTIVE listings, as the comp_research JSON shape. Every comp needs a verifiable source_url. Set sub_cut_definition to the sub-market and window_months to ${windowMonths}.`;
  const hash = await promptHash(SYSTEM_BASE_PROMPT, 'market-activity-v1');

  try {
    const result = await callPerplexity<unknown>({
      systemPrompt: SYSTEM_BASE_PROMPT,
      userPrompt,
      model: 'sonar-pro',
      responseSchema: CompResearchSchema,
      searchDomainFilter: compSearchDomains(),
      searchRecencyFilter: 'year',
      callSite: 'comp_research',
      runId,
      promptHash: hash,
    });
    const parsed = CompResearchDataSchema.safeParse(result.data);
    if (!parsed.success) {
      return sonarErrorOutput(
        `Sonar market-activity failed schema validation: ${parsed.error.issues[0]?.message ?? 'shape drift'}`
      );
    }
    return mapCompResearchData(parsed.data, result.citations);
  } catch (e) {
    const msg =
      e instanceof PerplexityError ? e.message : e instanceof Error ? e.message : 'Sonar market research failed';
    return sonarErrorOutput(msg);
  }
}
