/**
 * lib/llm/perplexity-client.ts — V6.1.5 Perplexity Sonar adapter (D-066, D-067).
 *
 * The single entry point for every LLM call in the pricing path. Replaces the
 * per-file Anthropic fetch helpers (comp-researcher / strategy-brief /
 * location-classifier) as each is rewired in T-PRC-2 / T-PRC-3 / T-PRC-5.
 *
 * Locked decisions:
 *  - D-067: DIRECT FETCH, no SDK. Every existing LLM call in this repo uses raw
 *    fetch (comp-researcher, csv-column-mapper, ask-juno) and CF Pages is
 *    edge-only; Perplexity's endpoint is OpenAI-compatible. Zero new deps.
 *    The endpoint is overridable via PERPLEXITY_API_URL so the live smoke test
 *    can correct it without a code change (path uncertainty: /chat/completions).
 *  - Hard Rule #2: NO Anthropic fallback, NO silent provider routing. On a
 *    4xx/5xx / timeout / bad-shape we throw a typed PerplexityError; the caller
 *    surfaces a StatusDot and blocks the brief. Fail loud.
 *  - Hard Rule #4: every call writes a pricing_llm_calls audit row (success OR
 *    failure) with citations_count + cost_usd.
 *  - Hard Rule #5: response_format json_schema on every call — never prose-parse.
 *  - Hard Rule #6: citations come from the top-level array, never inline markers.
 *  - §2.5: the system prompt must NOT contain search directives — parameter
 *    filters do the searching. Guarded below.
 *
 * Edge-safe: fetch + AbortController only, no node: imports. The audit write
 * uses the service-role Supabase client (trusted server writer; bypasses RLS).
 */

import { insertPricingLlmCall } from '@/lib/repos/pricing-llm-calls';

export type SonarModel = 'sonar-pro' | 'sonar-reasoning-pro';

export type PricingCallSite =
  | 'location_classifier'
  | 'comp_research'
  | 'strategy_brief'
  | 'buyer_migration_thesis';

export type PerplexityCallStatus = 'success' | 'failed' | 'rate_limited' | 'timeout';

export interface PerplexityCallInput {
  /** Role + framework principles + JSON shape. NO search instructions (§2.5). */
  systemPrompt: string;
  userPrompt: string;
  model: SonarModel;
  /** Raw inner JSON Schema (the adapter wraps it in the json_schema envelope). */
  responseSchema: object;
  searchDomainFilter?: string[];
  searchRecencyFilter?: 'day' | 'week' | 'month' | 'year';
  searchAfterDate?: string; // ISO YYYY-MM-DD
  searchBeforeDate?: string; // ISO YYYY-MM-DD
  webSearchOptionsCount?: number; // soft result cap (default unset)
  callSite: PricingCallSite;
  runId: string; // correlation id for the audit log
  promptHash: string; // hash of the prompt file used (reproducibility)
  timeoutMs?: number; // default 60_000 (buyer-migration thesis can pass 90_000)
}

export interface PerplexityCitation {
  url: string;
  title?: string;
  snippet?: string;
}

export interface PerplexityCallResult<T> {
  data: T; // parsed JSON object (Sonar guarantees the shape via response_format)
  citations: PerplexityCitation[];
  rawResponseId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}

/** Typed failure. The caller decides whether to surface a StatusDot. */
export class PerplexityError extends Error {
  readonly httpStatus: number | null;
  readonly callSite: PricingCallSite;
  readonly runId: string;
  readonly status: PerplexityCallStatus;

  constructor(args: {
    message: string;
    httpStatus: number | null;
    callSite: PricingCallSite;
    runId: string;
    status: PerplexityCallStatus;
  }) {
    super(args.message);
    this.name = 'PerplexityError';
    this.httpStatus = args.httpStatus;
    this.callSite = args.callSite;
    this.runId = args.runId;
    this.status = args.status;
  }
}

// §2.3 prices ($ per 1M tokens). Web search is included in the token price —
// removing the max_uses cap does NOT add a separate billable.
const PRICES: Record<SonarModel, { inPerM: number; outPerM: number }> = {
  'sonar-pro': { inPerM: 3, outPerM: 15 },
  'sonar-reasoning-pro': { inPerM: 2, outPerM: 8 },
};

const DEFAULT_TIMEOUT_MS = 60_000;

const PERPLEXITY_API_URL =
  process.env.PERPLEXITY_API_URL ?? 'https://api.perplexity.ai/chat/completions';

// §2.5 — the system prompt is role + JSON shape only; searching is constrained
// via parameter filters, never prose directives. Catches the old "Search
// Zillow, Realtor.com..." anti-pattern. We match `search`/`google` as whole
// words — "research"/"findings" are safe because of the word boundary.
const SEARCH_DIRECTIVE_RE = /\b(search|google)\b/i;

interface PerplexityResponseBody {
  id?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  citations?: unknown;
  search_results?: unknown;
}

function computeCostUsd(model: SonarModel, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model];
  const raw = (inputTokens / 1_000_000) * p.inPerM + (outputTokens / 1_000_000) * p.outPerM;
  return Math.round(raw * 10_000) / 10_000; // numeric(10,4)
}

/**
 * Perplexity's search_after/before_date_filter require US `%m/%d/%Y`
 * (MM/DD/YYYY) — passing ISO 8601 is rejected with HTTP 400
 * `invalid_date_format` (this silently zero'd comp research until 5 Jun 2026,
 * V6.1.5-015). Callers pass ISO `YYYY-MM-DD` (the documented input contract);
 * we convert at the wire boundary. A non-ISO value passes through untouched so
 * a pre-formatted date still works.
 */
function toPerplexityDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
}

/**
 * Citations are a top-level array (Hard Rule #6). Perplexity has returned them
 * historically as `string[]` (URLs) and more recently as `search_results`
 * objects ({ url, title, ... }). Normalise both; never parse `[1]` markers.
 */
function normalizeCitations(body: PerplexityResponseBody): PerplexityCitation[] {
  const raw = body.citations ?? body.search_results;
  if (!Array.isArray(raw)) return [];
  const out: PerplexityCitation[] = [];
  for (const c of raw) {
    if (typeof c === 'string') {
      out.push({ url: c });
      continue;
    }
    if (c && typeof c === 'object') {
      const obj = c as { url?: unknown; title?: unknown; snippet?: unknown; text?: unknown };
      if (typeof obj.url === 'string') {
        out.push({
          url: obj.url,
          title: typeof obj.title === 'string' ? obj.title : undefined,
          snippet:
            typeof obj.snippet === 'string'
              ? obj.snippet
              : typeof obj.text === 'string'
                ? obj.text
                : undefined,
        });
      }
    }
  }
  return out;
}

export async function callPerplexity<T>(
  input: PerplexityCallInput
): Promise<PerplexityCallResult<T>> {
  // .trim() guards against a trailing newline from a `wrangler pages secret put`
  // piped value — an Authorization header with a stray "\n" 401s (or throws).
  const apiKey = process.env.PERPLEXITY_API_KEY?.trim();
  if (!apiKey) {
    // Hard error on a missing key (§2.4) — never a silent skip.
    throw new PerplexityError({
      message: 'PERPLEXITY_API_KEY is not configured on the server',
      httpStatus: null,
      callSite: input.callSite,
      runId: input.runId,
      status: 'failed',
    });
  }

  if (SEARCH_DIRECTIVE_RE.test(input.systemPrompt)) {
    // Programming error, not a runtime failure — throw before spending a call.
    throw new Error(
      `callPerplexity(${input.callSite}): the system prompt contains a search directive. §2.5 forbids "search"/"google" in the system prompt; constrain the search via search_domain_filter / search_after_date_filter instead.`
    );
  }

  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();

  const body: Record<string, unknown> = {
    model: input.model,
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: input.callSite, schema: input.responseSchema },
    },
  };
  if (input.searchDomainFilter?.length) body.search_domain_filter = input.searchDomainFilter;
  if (input.searchRecencyFilter) body.search_recency_filter = input.searchRecencyFilter;
  if (input.searchAfterDate) body.search_after_date_filter = toPerplexityDate(input.searchAfterDate);
  if (input.searchBeforeDate) body.search_before_date_filter = toPerplexityDate(input.searchBeforeDate);
  if (input.webSearchOptionsCount != null) {
    // Field name provisional pending live-API verification (Viktor-tick). Unset
    // by default for comp research (no result cap — that is the whole point).
    body.web_search_options = { result_count: input.webSearchOptionsCount };
  }

  // Best-effort audit write — a DB blip must never mask the real Sonar outcome
  // nor turn a good brief into a failure (Hard Rule #4 is "write a row", and we
  // do; if the DB itself is down we log rather than fail the user's brief).
  const writeAudit = async (args: {
    status: PerplexityCallStatus;
    httpStatus: number | null;
    errorMessage: string | null;
    inputTokens: number;
    outputTokens: number;
    citationsCnt: number;
  }): Promise<void> => {
    try {
      await insertPricingLlmCall({
        runId: input.runId,
        callSite: input.callSite,
        model: input.model,
        status: args.status,
        httpStatus: args.httpStatus,
        errorMessage: args.errorMessage,
        latencyMs: Date.now() - startedAt,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        costUsd: computeCostUsd(input.model, args.inputTokens, args.outputTokens),
        citationsCnt: args.citationsCnt,
        promptHash: input.promptHash,
      });
    } catch (e) {
      console.error(
        `pricing_llm_calls insert failed (${input.callSite}/${input.runId}):`,
        e instanceof Error ? e.message : e
      );
    }
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let resp: Response;
  try {
    resp = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const aborted = err instanceof Error && err.name === 'AbortError';
    const status: PerplexityCallStatus = aborted ? 'timeout' : 'failed';
    const message = aborted
      ? `Sonar request timed out after ${timeoutMs}ms`
      : `Sonar network error: ${err instanceof Error ? err.message : String(err)}`;
    await writeAudit({
      status,
      httpStatus: null,
      errorMessage: message,
      inputTokens: 0,
      outputTokens: 0,
      citationsCnt: 0,
    });
    throw new PerplexityError({
      message,
      httpStatus: null,
      callSite: input.callSite,
      runId: input.runId,
      status,
    });
  }
  clearTimeout(timer);

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    const status: PerplexityCallStatus = resp.status === 429 ? 'rate_limited' : 'failed';
    const message = `Sonar HTTP ${resp.status}: ${errText.slice(0, 300)}`;
    await writeAudit({
      status,
      httpStatus: resp.status,
      errorMessage: message,
      inputTokens: 0,
      outputTokens: 0,
      citationsCnt: 0,
    });
    throw new PerplexityError({
      message,
      httpStatus: resp.status,
      callSite: input.callSite,
      runId: input.runId,
      status,
    });
  }

  let parsedBody: PerplexityResponseBody;
  try {
    parsedBody = (await resp.json()) as PerplexityResponseBody;
  } catch (err) {
    const message = `Sonar returned a non-JSON body: ${err instanceof Error ? err.message : String(err)}`;
    await writeAudit({
      status: 'failed',
      httpStatus: resp.status,
      errorMessage: message,
      inputTokens: 0,
      outputTokens: 0,
      citationsCnt: 0,
    });
    throw new PerplexityError({
      message,
      httpStatus: resp.status,
      callSite: input.callSite,
      runId: input.runId,
      status: 'failed',
    });
  }

  const inputTokens = Number(parsedBody.usage?.prompt_tokens ?? 0);
  const outputTokens = Number(parsedBody.usage?.completion_tokens ?? 0);
  const citations = normalizeCitations(parsedBody);
  const content = parsedBody.choices?.[0]?.message?.content;

  if (typeof content !== 'string' || content.trim() === '') {
    const message = 'Sonar response had no message content';
    await writeAudit({
      status: 'failed',
      httpStatus: resp.status,
      errorMessage: message,
      inputTokens,
      outputTokens,
      citationsCnt: citations.length,
    });
    throw new PerplexityError({
      message,
      httpStatus: resp.status,
      callSite: input.callSite,
      runId: input.runId,
      status: 'failed',
    });
  }

  let data: T;
  try {
    data = JSON.parse(content) as T;
  } catch (err) {
    // response_format json_schema should guarantee valid JSON. If it doesn't,
    // that is a hard failure — we do NOT fall back to prose parsing (Hard Rule #5).
    const message = `Sonar response_format did not yield valid JSON: ${err instanceof Error ? err.message : String(err)}`;
    await writeAudit({
      status: 'failed',
      httpStatus: resp.status,
      errorMessage: message,
      inputTokens,
      outputTokens,
      citationsCnt: citations.length,
    });
    throw new PerplexityError({
      message,
      httpStatus: resp.status,
      callSite: input.callSite,
      runId: input.runId,
      status: 'failed',
    });
  }

  await writeAudit({
    status: 'success',
    httpStatus: resp.status,
    errorMessage: null,
    inputTokens,
    outputTokens,
    citationsCnt: citations.length,
  });

  return {
    data,
    citations,
    rawResponseId: typeof parsedBody.id === 'string' ? parsedBody.id : '',
    inputTokens,
    outputTokens,
    costUsd: computeCostUsd(input.model, inputTokens, outputTokens),
    latencyMs: Date.now() - startedAt,
  };
}
