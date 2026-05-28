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
  isNewConstruction: boolean;
  /** Days on market (listing → contract/closing). Null when unknown. */
  domDays: number | null;
  sourceUrl: string | null;
  sourceName: string;
  psf: number;
  confidence: 'confirmed' | 'estimated';
  notes: string | null;
}

export interface CompResearchOutput {
  comps: ResearchedComp[];
  dataGap: boolean;          // true when fewer than 3 closed comps returned
  confidence: 'high' | 'medium' | 'low';
  sourcesSearched: string[];
  narrativeSummary: string;
  usedWebSearch: boolean;
  error?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt builder
// ────────────────────────────────────────────────────────────────────────────

function buildPrompt(input: CompResearchInput, knowledgeOnly: boolean): string {
  const window = input.compWindowMonths ?? 18;
  const desc = [
    `Address: ${input.address}`,
    `Sub-market: ${input.subCutLabel} (East End of Long Island, NY)`,
    `Above-grade sq ft: ${input.agSqft.toLocaleString()} SF`,
    input.lotSizeAcres ? `Lot size: ${input.lotSizeAcres} acres` : null,
    input.yearBuilt ? `Year built: ${input.yearBuilt}` : null,
    `Property type: ${input.isNc ? 'New construction (recently built)' : 'Resale (existing home)'}`,
  ]
    .filter(Boolean)
    .join('\n');

  const searchInstruction = knowledgeOnly
    ? `Use your knowledge of the Hamptons / East End real estate market. Mark all comps with confidence: "estimated" since this is not from live MLS data. Prefer the most recent comps you have credible knowledge of. If you have NO credible specific comps for this sub-market, return an empty comps array rather than fabricating addresses.`
    : `Search Zillow.com, Realtor.com, Out East (outeast.com), Sotheby's International Realty (sothebysrealty.com), Compass (compass.com), Douglas Elliman (elliman.com), and Bespoke (bespokerealestate.com) for recent sales data. Only return comps with addresses you can verify via search results. Mark each comp's source_url with the actual URL you found it at.`;

  return `You are a real estate comp researcher for the East End of Long Island (Hamptons, North Fork, Shelter Island), NY. Your output drives an IC pricing decision — accuracy and honest sourcing matter more than coverage.

SUBJECT PROPERTY:
${desc}

TASK: Find comparable residential sales to support exit pricing analysis.

${searchInstruction}

SEARCH CRITERIA:
1. CLOSED sales in ${input.subCutLabel} within the last ${window} months — highest priority.
2. ACTIVE/PENDING listings in ${input.subCutLabel} — these set the price ceiling.
3. Size range: within ±35% of ${input.agSqft.toLocaleString()} SF.
4. Construction type MUST match: ${input.isNc ? 'new construction ONLY (completed 2020 or later, or explicitly listed as new construction). Do NOT include resales.' : 'resale / existing homes ONLY. Do NOT include new construction.'}
5. Minimum 3 closed comps; include 1–3 active listings as ceiling indicators.

CLASSIFICATION:
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

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
  if (useWebSearch) {
    headers['anthropic-beta'] = 'web-search-2025-02-14';
  }

  let lastStatus = 0;
  for (const model of MODEL_FALLBACK_CHAIN) {
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages,
    };
    if (useWebSearch) {
      body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
      body.tool_choice = { type: 'auto' };
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
          ?.filter((c): c is { type: string; text: string } =>
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
export async function researchComps(
  input: CompResearchInput,
  apiKey: string
): Promise<CompResearchOutput> {
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
