# Juno Atlas — Claude Code Instructions V6.1.5 (Pricing Engine → Perplexity Sonar, end-to-end)

> **Status:** ⏸ DEFERRED — to start after V6.2 ships (tag `v6.2.0`).
> **Source:** Provided by Viktor as a docx on 3 Jun 2026; transcribed to Markdown 3 Jun 2026 (commit pending).
> **Conflicts to resolve at kickoff:** migration numbering (see §0a below) — V6.1.5 must rebase to `0036 + 0037` because V6.2 already claims `0033–0036`. The Ask-Juno-routes-Sonar sequencing in §2.9 is also retroactive — V6.1 T115 shipped without the Sonar tool path and will need a follow-up amendment.

---

## 0a. Reconciliation notes (added 3 Jun 2026 by Claude when storing in backlog)

This plan was authored **before** V6.1 closed (tag `v6.1.0` 9ecc636, `v6.1.1` ad96a82, `v6.1.2` 1094d41). The plan assumed V6.1.5 would run parallel to V6.1 Part 1 and merge before V6.1 T115 (Ask Juno agent). That sequencing constraint cannot be met because V6.1 has already shipped, T115 included. Three adjustments needed when V6.1.5 starts:

1. **Migration numbering:** V6.1.5 §spec says migrations `0034` (`pricing_llm_calls` + `pricing_runs.citations` + `pricing_runs.llm_provider` + `pricing_runs.llm_total_cost_usd`) and `0035` (`comps.source_url` + `comps.relist_count` + `comps.first_listed_at` + `comps.current_dom_days` + optionally `pricing_runs.buyer_migration_thesis`). V6.2 (drafted at `atlas/docs/CLAUDE_CODE_INSTRUCTIONS_V6_2.md`) claims `0033 → 0036`. V6.1.5 **rebases to `0036` and `0037`** assuming V6.2 ships first. If V6.2 ends up claiming fewer numbers, V6.1.5 takes the next available pair contiguous with the V6.2 cap.
2. **Decision IDs:** V6.1.5 claims `D-057 → D-064`. V6.1 ended at `D-056` ✓. V6.2 claims `D-057 → D-065`. So **V6.1.5 rebases to `D-066 → D-073`** when V6.2 ships. (If V6.2 claims fewer than D-065, V6.1.5 takes the next contiguous block.)
3. **T115 follow-up:** V6.1 T115 (Ask Juno agent) shipped without a `research_comps` tool that routes to Sonar. When V6.1.5 ships its Perplexity adapter, a follow-up T115.v2 ticket should add a `research_comps` tool to `lib/ask-juno/tools.ts` that wraps `callPerplexity` — covered as a deviation V6.1.5-001 in the V6.1.5 close PR.

Aside from those three rebases, the plan stands as written.

---

## −1. Purpose of V6.1.5 — single source of truth

The Atlas exit-pricing engine has a strong commercial framework (closed > active, sub-cut by physical attribute, NC primary lens, facts/judgement/narrative separated) and three clean worked examples that act as a regression suite (**Big Bing**, **6 GC**, **84 SBR**). The 3 June 2026 review found that the framework is sound but the **research layer is the bottleneck**:

- Anthropic's `web_search_20250305` is capped at `max_uses: 5` per call, so triangulation in thin sub-cuts hits the cap and degrades silently.
- There is no programmatic **buyer-migration thesis test** — when a sub-cut has < 3 closed comps the engine emits "stretch" verbiage but never actually tests the adjacent sub-cut.
- Triangulation in data-gap cases is freeform prose, not a structured block — comparing two runs of the same property is hard.
- The page-level workaround in `atlas/app/pricing/page.tsx` lines 32–37 explicitly admits "AI-returned comps tend to be 12–24 months old". Stale comps are a recurring leakage.

**The decision Viktor made on 3 June:** move the entire pricing engine to Perplexity Sonar end-to-end. **No Anthropic in the pricing path. No silent fallback.** This both closes the four gaps (Sonar has no per-call search cap, first-class citation array, JSON schema response format, and `sonar-reasoning-pro` for the thesis test) and removes the dual-provider operational tax in the pricing-only surface.

V6.1.5 closes the gap in three coordinated steps:

1. **Provider swap with no behaviour drift** (T-PRC-0 to T-PRC-3). A Perplexity client adapter replaces every Anthropic call inside `atlas/lib/pricing/*`. The framework principles (closed > active, sub-cut by physical attribute, NC primary lens) and the four hard rules of the exit framework are preserved verbatim. The 3 worked examples stay as the regression test — Big Bing land at $1,100/$1,450/$1,800 (SF) / $650/$850/$1,200 (inland), 6 GC at $1,213–1,248/sf base + 21% Osprey premium, 84 SBR at $7.5M base.
2. **Use the headroom Sonar gives us to close the 4 research gaps** (T-PRC-4 and T-PRC-5). Structured triangulation block. Buyer-migration thesis test via `sonar-reasoning-pro`. Sonar's uncapped web search removes the "5 searches per call" leakage entirely.
3. **Operational polish + ship** (T-PRC-6). Stuck-listing tracker (relist + DOM), PDF export of the strategy brief for board packs, and the V6.1.5 close PR.

V6.1.5 does NOT touch the engine math (`pricing-framework.ts`), the L/B/H human commit step, the partner-disagreement reconciliation, or anything outside `atlas/lib/pricing/*` and the two new migrations. The engine itself is not touched — Hard Rule #2 of the V6.1 sprint stands.

---

## 0. ACK first — do not skip

Before any code:

1. Read this document end-to-end, including Section −1 (Purpose), Section 3 (Framework principles — preserved verbatim), Section 4 (Hard Rules — extended), and the §2.x design decisions.
2. Open a PR titled `chore: ACK CLAUDE_CODE_INSTRUCTIONS_V6_1_5_PRICING`. The PR adds nothing except this file at `atlas/docs/CLAUDE_CODE_INSTRUCTIONS_V6_1_5_PRICING.md` and an `ACK_V6_1_5.md` containing:

```
T-PRC-0 to T-PRC-6: I have read CLAUDE_CODE_INSTRUCTIONS_V6_1_5_PRICING.md.
V6.1 + V6.2 sprints have both closed — confirmed (per reconciliation §0a).
I understand V6.1.5 has THREE phases:
  PHASE A (T-PRC-0, T-PRC-1): Adapter + repo audit + retire Anthropic from pricing.
  PHASE B (T-PRC-2, T-PRC-3): Swap research + brief synthesis to Sonar with citations + JSON schema.
  PHASE C (T-PRC-4, T-PRC-5, T-PRC-6): Close the 4 research gaps + stuck-listing tracker + ship.
I will not break the Hard Rules:
  1. No engine calc changes (V6.1 Hard Rule #2 stands).
  2. Perplexity is the ONLY LLM provider in the pricing path. No Anthropic fallback.
     No silent degradation.
  3. No new UI libraries — compose from ja-* primitives.
  4. Every Sonar call writes a row to the existing pricing audit log with citations[] persisted.
  5. The 3 worked examples (Big Bing, 6 GC, 84 SBR) are the regression suite —
     every PR runs them.
I understand that on Sonar 4xx/5xx the engine fails loud: surfaces a StatusDot
  on /pricing, blocks the strategy brief from rendering, and DOES NOT silently
  route around to a fallback model or to Anthropic.
I will preserve the 4 framework principles, 6-step process, and rider/maker
  +15% / +30% thresholds verbatim. They live in the prompt template, not in code.
I will rebase migration numbers + decision IDs per §0a before T-PRC-1 starts.
I will request Viktor's approval before any stop-and-ask condition.

Signed: Claude (instance + date)
```

3. Wait for Viktor to merge the ACK. Then start T-PRC-0.

---

## 1. Context — what V6.1.5 closes

The 3 June 2026 review of `atlas/lib/pricing/*` at commit `baa8015` found:

- `comp-researcher.ts` (572 lines) — Anthropic `sonnet-4-5` + `web_search_20250305` capped at `max_uses: 5`. In a thin sub-cut (e.g. Sound-front NC on the North Fork — 0 closed comps over 24 months) the model burns the cap on inland substitutes before finding the in-sub-cut active set. Triangulation never starts.
- `strategy-brief.ts` (897 lines) — Anthropic `sonnet-4-5`, no web search, `max_tokens: 6000`, strict JSON. Works correctly but is bottlenecked by whatever the first call surfaced. If the comp researcher missed the buyer-migration question, the brief can't ask it.
- `location-classifier.ts` (322 lines) — Anthropic `sonnet-4-5`. Classifies the subject and picks the comparison frame (which Hamptons sub-market, AG range, sub-cut definition).
- `pricing-framework.ts` (855 lines) — Pure engine logic. Reads the comp set, classifies maker vs rider, validates the human L/B/H commit against the band, flags partner disagreement, gates on data-gap rules. **Not touched by V6.1.5.**
- `atlas/app/pricing/page.tsx` lines 32–37: explicit admission that AI-returned comps tend to be 12–24 months old. 5-year window applied as a workaround. The workaround stays, but Sonar's recency filter + uncapped search reduce its load.

**The four material gaps from EXIT_PRICING_ENGINE_REVIEW_V1.md:**

1. **5-search cap** — Anthropic's web search tool ceiling. Sonar Pro has no `max_uses` cap and search is included in the token price.
2. **No buyer-migration thesis test** — When closed in-sub-cut comps < 3, the framework requires testing the adjacent sub-cut for buyer migration (would a North Fork bayfront NC buyer realistically substitute to a Shelter Island bayfront NC?). Today's engine emits "stretch" verbiage but never programmatically tests this.
3. **Freeform triangulation** — Data-gap reconciliation is prose in the strategy brief. No structured `triangulation_block` makes run-over-run comparison hard.
4. **Stale citations** — Anthropic returns inline citations in prose. Sonar returns a top-level `citations[]` array with each source URL — first-class, persistable, deduplicable.

V6.1.5 fixes all four by moving to Sonar and using the headroom to add a structured triangulation block, a buyer-migration thesis call against `sonar-reasoning-pro`, and a `citations[]` JSONB column on comps + briefs.

---

## 2. Viktor's locked design parameters for V6.1.5

### 2.1 Perplexity is the ONLY provider in the pricing path

Every LLM call inside `atlas/lib/pricing/*` calls Perplexity. **No Anthropic fallback. No silent provider routing.** If Sonar returns 4xx or 5xx, the engine fails loud:

- Strategy brief does not render.
- A `<StatusDot>` (V6.1 T113) appears next to "Market intelligence" on `/pricing` with severity `error` and the verbatim Sonar error in the popover.
- The audit log row is written with `status = 'failed'` so the failure is queryable.

User retries. No silent degradation. No silent provider routing.

Anthropic stays wired up elsewhere in the platform (V6.1 T108 CSV importer, V6.1 T116 file ingester) — V6.1.5 does NOT touch those. The retirement is scoped to `atlas/lib/pricing/*` only.

### 2.2 Endpoint, SDK, and models

**SDK:** `@perplexity-ai/perplexity_ai` (official). If the official SDK has gaps for `response_format` or `search_domain_filter`, fall back to direct fetch against the OpenAI-compatible endpoint `https://api.perplexity.ai/v1/chat/completions`. Document the choice in D-058 (rebases to D-067).

`/v1/responses` exists as an alias for the Agent API — V6.1.5 does not use it. Pricing calls are all chat-completions. Reasons: structured outputs are stable on chat-completions, and the pricing path is one-shot, not multi-turn.

**Models:**

- `sonar-pro` — comp research (`comp-researcher.ts`) AND brief synthesis (`strategy-brief.ts`) AND location classification (`location-classifier.ts`).
- `sonar-reasoning-pro` — the buyer-migration thesis test in T-PRC-5 only. Reserved for the one call that benefits from chain-of-thought (does a North Fork bayfront NC buyer substitute to a Shelter Island bayfront NC at this price?).

No model fan-out, no model ensembling. One model per call. Predictable cost.

### 2.3 Cost model — flat vs Anthropic

Per the 3 June pricing check (AI Pricing Guru):

- Sonar Pro: $3 input / $15 output per 1M tokens. Web search included; no `max_uses` cap.
- Sonar Reasoning Pro: $2 input / $8 output per 1M tokens. Same inclusion.

A typical brief: ~8k input + ~3k output across the chain = ~$0.15–0.18 per brief, roughly flat to the existing Anthropic spend. Quote includes the new buyer-migration thesis call. The 5-search cap removal does NOT inflate cost — Sonar prices search into the per-token cost, not as a separate billable.

### 2.4 API key — Cloudflare Pages secret PERPLEXITY_API_KEY

Add `PERPLEXITY_API_KEY` as a Cloudflare Pages secret. Do NOT remove `ANTHROPIC_API_KEY` — it stays for V6.1 T108 + T116. Do not commit keys to the repo or to `.env.example` (V3 security baseline).

`atlas/lib/llm/perplexity-client.ts` reads only `process.env.PERPLEXITY_API_KEY`. If missing on cold start: hard error, not a silent skip.

### 2.5 Sonar prompting discipline — per the Perplexity Prompt Guide

- **Do NOT put search instructions in the system prompt.** No "search for closed sales of 4-bed bayfront properties in 2024–2026". The system prompt describes the role and the JSON shape only.
- **Use parameter filters, not prose, to constrain the search:**
  - `search_domain_filter`: scope to `["zillow.com", "redfin.com", "compass.com", "douglaselliman.com", "corcoran.com", "saunders.com"]` for Hamptons comps. Tune per sub-market.
  - `search_recency_filter`: `"month"` for ultra-fresh comps; default `"year"` for the standard 24-month framework window.
  - `search_after_date_filter` / `search_before_date_filter`: explicit date range when the framework window matters (closed comps within 24 months of the run date).
  - Cap result counts via the SDK's `web_search_options` to keep latency stable.
- **Use `response_format` with a JSON schema for guaranteed shape.** No more "parse the prose for the JSON block". Sonar honours `response_format: {type: "json_schema", json_schema: {...}}`.
- **Citations come from the top-level `citations[]` array in the response.** Do NOT parse citation markers like `[1]` out of the prose. Persist the array to `pricing_runs.citations` (new column, T-PRC-2 migration 0036 per §0a).

### 2.6 Structured response shape — guaranteed JSON via `response_format`

Three call sites, three JSON schemas. All three schemas live in `atlas/lib/llm/perplexity-schemas.ts` and are imported wherever needed.

```typescript
// atlas/lib/llm/perplexity-schemas.ts

export const CompResearchSchema = {
  type: "json_schema",
  json_schema: {
    name: "comp_research",
    schema: {
      type: "object",
      required: ["closed", "active", "sub_cut_definition", "window_months", "framework_notes"],
      properties: {
        sub_cut_definition: { type: "string" },          // e.g. "Bayfront NC 4-5BR ≥ 4,500sqft"
        window_months: { type: "integer" },              // 24 default, can stretch
        closed: { type: "array", items: { $ref: "#/$defs/Comp" } },
        active: { type: "array", items: { $ref: "#/$defs/Comp" } },
        framework_notes: { type: "string" },             // free text from the model on data quality
        data_gap_severity: { type: "string", enum: ["none","amber","red"] },
      },
      $defs: {
        Comp: {
          type: "object",
          required: ["address","status","price_usd","ag_sqft","price_per_sqft","attributes","source_url"],
          properties: {
            address: { type: "string" },
            status: { type: "string", enum: ["closed","active","contract","withdrawn","expired"] },
            price_usd: { type: "number" },
            ag_sqft: { type: "integer" },
            bg_sqft: { type: "integer" },
            price_per_sqft: { type: "number" },
            list_date: { type: "string" },              // ISO
            sale_date: { type: "string" },              // ISO or null
            dom_days: { type: "integer" },
            relist_count: { type: "integer" },          // T-PRC-6 stuck-listing tracker
            first_listed_at: { type: "string" },        // T-PRC-6
            attributes: {
              type: "object",
              properties: {
                construction: { type: "string", enum: ["new","resale","reno"] },
                waterfront: { type: "string", enum: ["sound","bay","ocean","none","creek"] },
                bedrooms: { type: "integer" },
                pool: { type: "boolean" },
                acreage: { type: "number" },
              }
            },
            source_url: { type: "string" },             // primary listing URL
          }
        }
      }
    }
  }
};

export const StrategyBriefSchema = { /* see T-PRC-3 §spec */ };
export const BuyerMigrationThesisSchema = { /* see T-PRC-5 §spec */ };
```

### 2.7 Citations as first-class data

Two new columns persist citations:

- `pricing_runs.citations jsonb` — top-level Sonar `citations[]` from the brief call. Array of `{url, title, snippet}` objects. JSONB so we can query by domain later.
- `comps.source_url text` — added in migration 0037 (per §0a rebase). One URL per comp, the primary listing.

UI consumes both: on `/pricing/[runId]`, every `$/sqft` figure in the brief renders with a small inline source chip (`[Compass](https://...)`) that links to the listing. No prose citations. No `[1]` markers anywhere.

### 2.8 Failure mode — fail loud, never silent

Per §2.1. The audit log row schema for a pricing call:

```typescript
{
  run_id: string,
  call_site: 'location_classifier' | 'comp_research' | 'strategy_brief' | 'buyer_migration_thesis',
  model: 'sonar-pro' | 'sonar-reasoning-pro',
  status: 'success' | 'failed' | 'rate_limited' | 'timeout',
  latency_ms: number,
  input_tokens: number,
  output_tokens: number,
  cost_usd: number,                  // computed from §2.3 prices
  citations_count: number,
  http_status: number | null,
  error_message: string | null,      // verbatim Sonar error on failure
}
```

StatusDot on `/pricing` reads the latest row per `call_site` for the latest `run_id` and surfaces a dot whenever any is not `success`.

### 2.9 Sequencing inside the V6.1 sprint *(see §0a — superseded)*

V6.1.5 was originally scoped to run parallel to V6.1 Part 1 and merge before T115. **That sequencing constraint is now retroactive — V6.1 has shipped.** New sequencing per §0a: V6.1.5 runs after V6.2 ships. T115 v2 follow-up adds a Sonar-backed `research_comps` tool to `lib/ask-juno/tools.ts`.

### 2.10 Framework prompts live in `atlas/lib/pricing/prompts/*.md`

The 4 framework principles, 6-step process, rider/maker thresholds, and the worked examples live in versioned markdown files, NOT inline string literals. This lets Viktor edit prompts without a code review. The files:

- `atlas/lib/pricing/prompts/system-base.md` — role: "exit pricing analyst for Hamptons new-construction luxury villas". Framework principles. No search instructions (per §2.5).
- `atlas/lib/pricing/prompts/comp-research-user.md` — user-message template for `comp-researcher.ts`. Variables substituted via `${var}` syntax.
- `atlas/lib/pricing/prompts/strategy-brief-user.md` — user-message template for `strategy-brief.ts`.
- `atlas/lib/pricing/prompts/buyer-migration-thesis-user.md` — for T-PRC-5.
- `atlas/lib/pricing/prompts/triangulation-user.md` — for T-PRC-4.

Each file is read once on cold start, cached in memory. Hash logged in the audit row (`prompt_hash`) so a brief is reproducible across prompt revisions.

---

## 3. Framework principles — preserve verbatim, source of truth lives in the prompt files

These are the principles Viktor codified in the exit-pricing framework (session 479f0c8d, 2026-06-01-07, Turn 5). They MUST appear unchanged in `atlas/lib/pricing/prompts/system-base.md`. Claude Code does NOT paraphrase.

### 3.1 The 4 principles

- **P1. Closed > Active.** A sold price is a fact. An asking price is an aspiration. The framework's centre of gravity is the closed set. Active comps inform the ceiling and tell you what the next buyer is told to believe — they don't price your property.
- **P2. Sub-cut by physical attribute, not by zip code.** "North Fork bayfront NC ≥ 4,500 AG sqft, 4-5BR" is a sub-cut. "Southold" is a zip code. Properties price within their physical bracket; the bracket is defined by waterfront, construction status (NC vs resale), bedrooms, and AG sqft band — in that order of weight.
- **P3. NC primary, resale secondary.** New construction prices differently from resale of the same AG sqft. The first lens is always the closed-NC set in the sub-cut. Resale is informative for the ceiling and for the buyer-migration thesis test, never primary.
- **P4. Facts → judgement → narrative, separated.** The brief has three layers that never bleed into each other: (a) the closed-set facts as a structured table, (b) the engine's judgement — band derivation, maker/rider classification, data-gap severity, (c) the narrative — what the buyer is told and how. The L/B/H human commit gates the transition from (b) to (c).

### 3.2 The 6-step process

1. **Define the window.** Default 24 months. Stretch to 36 only when `data_gap_severity = amber`. Never beyond 36.
2. **Pull comps.** Closed first, then active. Always tagged with sub-cut definition.
3. **Identify the gap.** If closed in-sub-cut < 3 → red flag → mandatory triangulation block (T-PRC-4) and mandatory buyer-migration thesis test (T-PRC-5).
4. **Buyer-migration thesis test.** Adjacent sub-cut: would the buyer substitute? Programmatic via `sonar-reasoning-pro`.
5. **Commit L/B/H anchored to named comps.** Every band number cites at least one closed comp by address. No anonymous numbers.
6. **Reconcile partner disagreement.** Existing engine path. Not touched by V6.1.5.

### 3.3 Rider vs Maker — the +15% / +30% thresholds

- **Rider (price-taker):** commit a band whose midpoint is within the strongest in-sub-cut closed NC ± 10%.
- **Stretch Rider:** midpoint up to +15% above the strongest in-sub-cut closed NC. Requires named premium attributes (waterfront upgrade, larger AG, premium finishes documented).
- **Market-Maker:** midpoint more than +30% above the strongest in-sub-cut closed NC. Allowed ONLY when closed in-sub-cut = 0 AND active in-sub-cut has at least 2 listings above the proposed midpoint AND buyer-migration thesis is documented.
- The 15–30% band is the "no-man's land" — engine asks for explicit justification, brief surfaces a `<StatusDot>` warning until partner reconciliation passes.

### 3.4 The 3 worked examples — these are the regression suite

Every V6.1.5 PR runs all three. Output bands must match within tolerance:

- **Big Bing North Fork** — Sound-front 5BR NC. Sub-cut: Sound-front NC, 5BR, ≥ 5,000 AG sqft. Closed in-sub-cut: 0 over 24 months. Active in-sub-cut: 2 (one at $13.5M, one at $11.8M).
  - SF (Sound-front lot) band: $1,100 / $1,450 / $1,800 per AG sqft. Classification: **Market-Maker.** Anchors: 3745 Nassau Point closed $1,455/sf (bayfront NC, adjacent sub-cut) — buyer-migration thesis required.
  - Inland (no-water lot) band: $650 / $850 / $1,200 per AG sqft. Classification: **Stretch Rider.** Anchors: 5235 Bridge Ln $522/sf (resale, North Fork inland), 625 Park Ave $1,048/sf (bayfront NC ceiling reference).
- **6 Great Circle Drive Shelter Island.** Sub-cut: Shelter Island non-WF NC, 4BR, 3,800-4,500 AG sqft.
  - Base band: $1,213 – $1,248 / AG sqft. Classification: **Rider.**
  - Anchor: 16 Osprey Way closed $1,000/sf + 21% premium for new construction and finishes.
  - Active ceiling references: 11 Sunnyside $1,375/sf, 9 Margarets $1,270/sf.
- **84 South Bayfront Road North Haven.** Sub-cut: North Haven non-WF NC, 4-5BR, 4,500–5,500 AG sqft.
  - Base band: $7.5M total (midpoint). Classification: **Market-Rider.** Anchored within the Amagansett SoH / North Haven non-WF NC band.

These appear verbatim in `atlas/lib/pricing/__tests__/regression/*.fixture.json` and the regression runner asserts the engine's L/B/H commit and classification match.

---

## 4. Hard Rules — extended for V6.1.5

Carried forward from V6.1 §4 with three additions and two re-emphases:

1. **No engine calc changes.** V6.1 Hard Rule #2 stands. `pricing-framework.ts` is not touched. `pnpm test:golden` must stay green.
2. **Perplexity is the ONLY LLM provider** in `atlas/lib/pricing/*`. No Anthropic fallback. No silent provider routing.
3. **No new UI libraries.** V6.1 Hard Rule #3 stands. *(Service SDKs like `@perplexity-ai/perplexity_ai` are explicitly allowed per V6.1 patterns — pinning Anthropic via raw fetch was a choice not a rule.)*
4. **Every Sonar call writes an audit row.** Schema per §2.8. Includes `citations_count` and `cost_usd`.
5. **Every Sonar call uses `response_format` with a JSON schema.** No parsing JSON out of prose.
6. **Citations are top-level array,** never inline prose markers. Persist to `pricing_runs.citations` JSONB and `comps.source_url`.
7. **Framework prompts live in `atlas/lib/pricing/prompts/*.md`.** Not in code string literals. Prompt hash logged per call.
8. **The 3 worked examples are the regression suite.** Every PR runs them via `pnpm test:pricing:regression`. A drift > the tolerances in §3.4 blocks merge.
9. **Migrations 0000–0035 (post-V6.2 ceiling) are frozen.** V6.1.5 adds **0036 + 0037 only** (per §0a rebase).

---

## PHASE A — Adapter + audit + retire Anthropic from pricing

T-PRC-0 + T-PRC-1. Estimated 4 pomos. Must merge in full before T-PRC-2.

### T-PRC-0 — ACK + repo scan + audit register [P0, ~1 pomo]

**The discovery ticket.** No production code lands.

**Spec:**

1. Read this document end-to-end. Open the ACK PR per §0.
2. **Repo scan** — produce `atlas/docs/pricing/V6_1_5_AUDIT.md` listing every Anthropic call site in the pricing path. At minimum:
   - `atlas/lib/pricing/comp-researcher.ts` lines that call Anthropic (currently `anthropic.messages.create({ model: 'claude-sonnet-4-5', tools: [{ type: 'web_search_20250305', max_uses: 5 }] })`)
   - `atlas/lib/pricing/strategy-brief.ts` lines that call Anthropic
   - `atlas/lib/pricing/location-classifier.ts` lines that call Anthropic
   - Any other indirect call via `lib/llm/*` that the pricing path uses
3. **For each call site, log:**
   - File + line range
   - Model used
   - Whether web search is enabled and what cap
   - Whether `response_format` is used or prose is parsed
   - The Zod schema (if any) the response is validated against
   - Whether citations are surfaced to the UI and how
4. **Decisions register seeding** — append `D-066 → D-073` placeholders to `atlas/docs/DECISIONS.md` (per §0a rebase from `D-057 → D-064`):
   - D-066 Move pricing engine to Perplexity Sonar end-to-end (Viktor, 3 June 2026)
   - D-067 SDK choice: `@perplexity-ai/perplexity_ai` vs direct fetch
   - D-068 Models: `sonar-pro` standard + `sonar-reasoning-pro` for buyer-migration thesis
   - D-069 Citations persisted as JSONB on `pricing_runs.citations` + `comps.source_url`
   - D-070 Framework prompts moved to `atlas/lib/pricing/prompts/*.md`
   - D-071 Buyer-migration thesis as a separate call (T-PRC-5)
   - D-072 Stuck-listing tracker — relist + DOM (T-PRC-6)
   - D-073 Fail-loud on Sonar errors — no Anthropic fallback in pricing
5. **Cost shadow estimate.** Run one regression case (Big Bing) through Anthropic today and through Sonar via a sandbox key — record latency, token count, cost. Append to `V6_1_5_AUDIT.md`. This is the baseline against which the post-migration run is checked.

**Files to create:**

- `atlas/docs/pricing/V6_1_5_AUDIT.md`
- ACK files per §0

**Done-when:**

- [ ] ACK PR merged
- [ ] Audit doc lists every Anthropic call site in `atlas/lib/pricing/*` with file + line ranges
- [ ] D-066 through D-073 placeholders in `DECISIONS.md`
- [ ] Shadow cost estimate documented for the Big Bing run

**Hard Rules check:** No code change to runtime. ✓

**Stop-and-ask conditions:**

- Any Anthropic call site in the pricing path that lives outside `atlas/lib/pricing/*` (e.g. shared helper in `atlas/lib/llm/`) — surface the dependency, do not move it unilaterally.
- The shadow Sonar run produces a band materially outside the Big Bing fixture — flag, do not paper over.

### T-PRC-1 — Perplexity client adapter + PERPLEXITY_API_KEY secret + retire Anthropic from pricing [P0, ~3 pomos]

**The foundation ticket.** T-PRC-2 through T-PRC-6 depend on this adapter existing.

**Spec:**

1. Install `@perplexity-ai/perplexity_ai` SDK. No other new deps. If the SDK is missing `response_format` support or `search_domain_filter`, fall back to direct fetch — document in D-067.
2. **Adapter at `atlas/lib/llm/perplexity-client.ts`:**

```typescript
// atlas/lib/llm/perplexity-client.ts

import type { z } from 'zod';

export interface PerplexityCallInput {
  systemPrompt: string;                  // role + framework principles, no search instructions
  userPrompt: string;
  model: 'sonar-pro' | 'sonar-reasoning-pro';
  responseSchema: object;                // raw JSON schema (not Zod — Sonar wants JSON Schema draft 7)
  searchDomainFilter?: string[];
  searchRecencyFilter?: 'day' | 'week' | 'month' | 'year';
  searchAfterDate?: string;              // ISO YYYY-MM-DD
  searchBeforeDate?: string;
  webSearchOptionsCount?: number;        // soft cap, default unset
  callSite: 'location_classifier' | 'comp_research' | 'strategy_brief' | 'buyer_migration_thesis';
  runId: string;                         // for audit log
  promptHash: string;                    // hash of the prompt file used
  timeoutMs?: number;                    // default 60_000
}

export interface PerplexityCallResult<T> {
  data: T;                               // parsed JSON object (Sonar guarantees the shape)
  citations: Array<{ url: string; title?: string; snippet?: string }>;
  rawResponseId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}

export async function callPerplexity<T>(
  input: PerplexityCallInput
): Promise<PerplexityCallResult<T>>;
```

3. **Implementation requirements:**
   - Read `PERPLEXITY_API_KEY` from `process.env`. Throw on missing.
   - Use `response_format: { type: 'json_schema', json_schema: { name: input.callSite, schema: input.responseSchema } }`.
   - Pass `search_domain_filter` / `search_recency_filter` / `search_after_date_filter` / `search_before_date_filter` only when set.
   - System prompt contains NO search instructions (§2.5). Throw a dev-mode error if the system prompt contains words like "search", "find", "look up", "google".
   - Read citations from top-level `citations` array in the response (NOT from inline `[1]` markers).
   - Compute `costUsd` from input/output tokens × the §2.3 prices.
   - Write the audit log row (schema per §2.8) on every call — success OR failure.
   - On HTTP 4xx/5xx: throw a typed `PerplexityError` containing `httpStatus`, `errorMessage`, `callSite`, `runId`. Do NOT route to Anthropic. Do NOT retry beyond what the SDK does by default. Caller decides whether to surface.
   - Default timeout 60s. Configurable per call (the buyer-migration thesis can run up to 90s).
   - All calls are non-streaming for V6.1.5 (predictable JSON parsing).
4. **Audit log persistence** — write to a new table `pricing_llm_calls` introduced by migration 0036 (per §0a rebase). Table shape:

```sql
-- atlas/migrations/0036_pricing_llm_calls.sql (rebased from 0034)
CREATE TABLE atlas.pricing_llm_calls (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL,                    -- FK pricing_runs(id), enforced in V6.1.5
  call_site     text NOT NULL CHECK (call_site IN
                  ('location_classifier','comp_research','strategy_brief','buyer_migration_thesis')),
  model         text NOT NULL CHECK (model IN ('sonar-pro','sonar-reasoning-pro')),
  status        text NOT NULL CHECK (status IN ('success','failed','rate_limited','timeout')),
  http_status   int,
  error_message text,
  latency_ms    int NOT NULL,
  input_tokens  int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  cost_usd      numeric(10,4) NOT NULL DEFAULT 0,
  citations_cnt int NOT NULL DEFAULT 0,
  prompt_hash   text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON atlas.pricing_llm_calls (run_id);
CREATE INDEX ON atlas.pricing_llm_calls (call_site, status, created_at);
```

Also extend `pricing_runs` in the same migration:

```sql
ALTER TABLE atlas.pricing_runs ADD COLUMN citations jsonb;
ALTER TABLE atlas.pricing_runs ADD COLUMN llm_provider text NOT NULL DEFAULT 'perplexity';
ALTER TABLE atlas.pricing_runs ADD COLUMN llm_total_cost_usd numeric(10,4) NOT NULL DEFAULT 0;
```

5. **Retire Anthropic from pricing path** — `comp-researcher.ts`, `strategy-brief.ts`, `location-classifier.ts` lose their Anthropic imports. They will be re-wired in T-PRC-2 + T-PRC-3 to call `callPerplexity`. Until those tickets land, the pricing page is feature-flagged off (env var `PRICING_ENGINE_ENABLED=false`) — Viktor confirms before T-PRC-2 starts. (Alternative: ship the adapter behind a flag, leave Anthropic live, swap in T-PRC-2. Decide in D-073; document tradeoff.)
6. **No prompt files yet.** Those land in T-PRC-2.
7. **Vitest unit tests** with a recorded Sonar response (`__fixtures__/sonar-comp-research.json`). Tests cover happy path, 401, 429, 500, timeout. Each asserts that the audit row is written with the right status.

**Files to touch:**

- `atlas/lib/llm/perplexity-client.ts` (new)
- `atlas/lib/llm/__fixtures__/*.json` (new — recorded responses)
- `atlas/lib/llm/__tests__/perplexity-client.test.ts` (new)
- `atlas/migrations/0036_pricing_llm_calls.sql` (new, rebased from 0034)
- `atlas/lib/repos/pricing-llm-calls.ts` (new — insert helper)
- `atlas/lib/pricing/comp-researcher.ts` (remove Anthropic imports — stub call out)
- `atlas/lib/pricing/strategy-brief.ts` (remove Anthropic imports — stub call out)
- `atlas/lib/pricing/location-classifier.ts` (remove Anthropic imports — stub call out)
- `atlas/.env.example` (add `PERPLEXITY_API_KEY=` placeholder, NO real key)
- `atlas/docs/DECISIONS.md` (flesh out D-066 through D-073 with rationale)
- Cloudflare Pages secret `PERPLEXITY_API_KEY` added by Viktor (out-of-band — surface as a Done-when checkbox he ticks manually)

**Done-when:**

- [ ] Migration 0036 applied
- [ ] `callPerplexity` works against a sandbox Sonar key — proven by a one-off script `scripts/sonar-smoke.ts`
- [ ] Audit row written on success AND failure
- [ ] Anthropic imports gone from `atlas/lib/pricing/*` (grep audit: zero matches)
- [ ] `PERPLEXITY_API_KEY` added as Cloudflare Pages secret (Viktor confirms)
- [ ] Feature flag in place per §spec.5
- [ ] Vitest tests cover happy path + 4 failure modes
- [ ] D-067 documented (SDK vs direct fetch decision)
- [ ] D-073 documented (feature flag tradeoff)
- [ ] `pnpm test:golden` green (engine untouched)

**Hard Rules check:** Engine untouched. New adapter. No Anthropic in pricing. Migration only extends. ✓

**Stop-and-ask conditions:**

- The SDK does not support `response_format` with JSON schema — fall back to direct fetch, log in D-067 with rationale.
- Sonar returns a 5xx during smoke test that's not user-error — surface, do not paper over.
- Any pricing audit log path that didn't survive the Anthropic retire (e.g. an `anthropic_calls` table that's now orphaned) — surface; Viktor decides whether to drop or keep for historical query.

---

## PHASE B — Swap research + brief synthesis to Sonar

T-PRC-2 + T-PRC-3. Estimated 7 pomos. Must merge before T-PRC-4.

### T-PRC-2 — Swap researchComps + researchMarketActivity → sonar-pro with citations[] persistence [P0, ~4 pomos]

**Spec:**

1. **Migration `0037_comps_provenance.sql`** (rebased from 0035 per §0a):

```sql
ALTER TABLE atlas.comps ADD COLUMN source_url text;
ALTER TABLE atlas.comps ADD COLUMN relist_count int NOT NULL DEFAULT 0;
ALTER TABLE atlas.comps ADD COLUMN first_listed_at date;
ALTER TABLE atlas.comps ADD COLUMN current_dom_days int;          -- for actives

-- backfill source_url null for existing rows; new rows must set it
CREATE INDEX ON atlas.comps (first_listed_at) WHERE first_listed_at IS NOT NULL;
```

2. **Prompt files** at `atlas/lib/pricing/prompts/`:
   - `system-base.md` — role + 4 framework principles + 6-step process + rider/maker thresholds verbatim from §3. NO search instructions.
   - `comp-research-user.md` — user template with `${address}`, `${ag_sqft}`, `${bedrooms}`, `${waterfront}`, `${sub_cut_definition}`, `${window_months}` variables. Asks the model to return the `CompResearchSchema` shape.
3. **Rewire `comp-researcher.ts`** — replace the Anthropic body with a `callPerplexity<CompResearch>({...})` call.
   - Model: `sonar-pro`.
   - `searchDomainFilter`: `['zillow.com', 'redfin.com', 'compass.com', 'douglaselliman.com', 'corcoran.com', 'saunders.com']` — extendable via env var `PRICING_COMP_DOMAINS` (comma-separated).
   - `searchAfterDate`: today - window_months (defaults today - 24 months).
   - `searchBeforeDate`: today.
   - `searchRecencyFilter`: leave unset (let date range do the work — they compound otherwise).
   - `webSearchOptionsCount`: unset (no cap).
   - Validate the parsed JSON against a Zod mirror of `CompResearchSchema` for defence-in-depth — Sonar guarantees shape but Zod catches drift.
4. **Persist comps** — for each comp in the response, upsert into `atlas.comps` using `(address, status, sale_date)` as the natural key. Set `source_url`, `first_listed_at`, `relist_count`, `current_dom_days`.
5. **Persist citations** — write the top-level `citations[]` to `pricing_runs.citations` on the run row (jsonb column added in T-PRC-1's migration 0036).
6. **`/pricing/[runId]` UI** — every `$/sqft` number renders with a small inline source chip linking to the primary listing. Format: `$1,455/sf [Compass]`. Tiny ink-color text-on-text chip; opens in new tab.
7. **StatusDot integration** — if the call fails or `data_gap_severity = 'red'`, surface a dot next to "Comp set" on `/pricing/[runId]`.
8. **`researchMarketActivity`** (the second pre-existing helper in `comp-researcher.ts`) — same treatment. Second Sonar call against `sonar-pro`. Same domain filter, broader recency (year), used for narrative context not for the band derivation.

**Regression test:**

- `pnpm test:pricing:regression -- big-bing` — runs Big Bing fixture, asserts the returned comp set includes 3745 Nassau Point and 5235 Bridge Ln by name with `$/sqft` within 2% of fixture values.
- Same for 6 GC fixture (must surface 16 Osprey Way and 11 Sunnyside).
- Same for 84 SBR fixture.

**Files to touch:**

- `atlas/migrations/0037_comps_provenance.sql` (new, rebased from 0035)
- `atlas/lib/pricing/prompts/system-base.md` (new)
- `atlas/lib/pricing/prompts/comp-research-user.md` (new)
- `atlas/lib/pricing/comp-researcher.ts` (full rewire body)
- `atlas/lib/pricing/schemas.ts` (add Zod mirrors of `CompResearchSchema`)
- `atlas/lib/repos/comps.ts` (extend upsert to include `source_url`, `relist_count`, `first_listed_at`, `current_dom_days`)
- `atlas/lib/repos/pricing-runs.ts` (extend to persist citations)
- `atlas/app/pricing/[runId]/_components/comp-table.tsx` (add inline source chips)
- `atlas/lib/pricing/__tests__/regression/*.fixture.json` (3 new fixtures, one per worked example)
- `atlas/lib/pricing/__tests__/regression/regression.test.ts` (new test runner)

**Done-when:**

- [ ] Migration 0037 applied
- [ ] `comp-researcher.ts` calls `callPerplexity` only — no Anthropic import remains anywhere in the file
- [ ] System prompt file contains the 4 principles + 6 steps + rider/maker thresholds verbatim
- [ ] Comp upserts persist `source_url`, `first_listed_at`, `relist_count`, `current_dom_days`
- [ ] `pricing_runs.citations` populated for every successful run
- [ ] Comp table on `/pricing/[runId]` renders inline source chips
- [ ] Regression test passes for all 3 worked examples (Big Bing, 6 GC, 84 SBR)
- [ ] `pnpm test:golden` green
- [ ] D-069 documented in `DECISIONS.md`

**Hard Rules check:** Engine untouched. Adapter consumed correctly. Prompts in files. Citations top-level. ✓

**Stop-and-ask conditions:**

- A regression fixture asserts an anchor comp (e.g. 16 Osprey Way) that Sonar consistently fails to surface — first try widening `search_domain_filter`. If still missing, surface to Viktor; the fixture may need an updated anchor.
- Sonar returns a comp with `price_per_sqft` that disagrees with `(price_usd / ag_sqft)` by > 1% — log a warning, use the computed value, never the LLM-supplied one.

### T-PRC-3 — Swap callClaudeForBrief → sonar-pro with response_format JSON schema [P0, ~3 pomos]

**Spec:**

1. **Prompt file `atlas/lib/pricing/prompts/strategy-brief-user.md`** — user template for the synthesis call. Variables: `${subject_summary}`, `${comp_set_json}`, `${market_activity_json}`, `${human_lbh_commit}`, `${partner_disagreement_payload}`. Output is the `StrategyBriefSchema`.
2. **`StrategyBriefSchema`** in `atlas/lib/llm/perplexity-schemas.ts` — full shape:

```typescript
export const StrategyBriefSchema = {
  type: "json_schema",
  json_schema: {
    name: "strategy_brief",
    schema: {
      type: "object",
      required: ["recommendation", "breakevenThresholds", "quickMath",
                 "compEvidence", "marketSentiment", "reductionLadder",
                 "outcomeScenarios", "risks", "whyThisNumber", "finalRecommendation"],
      properties: {
        recommendation: {
          type: "object",
          required: ["low","best","high","classification","rationale"],
          properties: {
            low:  { type: "number" },   // $ total
            best: { type: "number" },
            high: { type: "number" },
            classification: { type: "string",
              enum: ["rider","stretch_rider","market_maker","market_rider"] },
            rationale: { type: "string" },
          }
        },
        breakevenThresholds: {           // $/sqft and $ total at margin = 0
          type: "object",
          properties: {
            margin_zero_total: { type: "number" },
            margin_zero_per_sqft: { type: "number" },
            margin_target_total: { type: "number" },
            margin_target_per_sqft: { type: "number" },
          }
        },
        quickMath: {                     // 3-5 facts the reader scans first
          type: "array",
          items: { type: "object", properties: {
            label: {type:"string"}, value: {type:"string"}, citation_idx: {type:"integer"} }
          }
        },
        compEvidence: {                  // structured anchors — comp + $/sf + cite
          type: "array",
          items: { type: "object", required: ["address","price_per_sqft","role","note"],
            properties: {
              address: {type:"string"},
              price_per_sqft: {type:"number"},
              role: {type:"string", enum:["anchor","ceiling","floor","outlier"]},
              note: {type:"string"},
              citation_idx: {type:"integer"},
            }
          }
        },
        marketSentiment: { type: "string" },     // 1 paragraph
        reductionLadder: {                       // Day 0 / 60 / 120 / 180 + walk-away floor
          type: "object", required: ["day0","day60","day120","day180","walkAwayFloor"],
          properties: {
            day0:        { type: "number" },
            day60:       { type: "number" },
            day120:      { type: "number" },
            day180:      { type: "number" },
            walkAwayFloor: { type: "number" },
          }
        },
        outcomeScenarios: {                      // bear / base / bull, weighted
          type: "array", minItems: 3, maxItems: 3,
          items: { type: "object", required: ["label","probability","clearing_price","narrative"],
            properties: {
              label: { type:"string", enum:["bear","base","bull"] },
              probability: { type:"number" },        // 0-1
              clearing_price: { type:"number" },
              narrative: { type:"string" },
            }
          }
        },
        risks: { type: "array", items: { type: "string" } },
        whyThisNumber: { type: "string" },       // 1 paragraph anchored to comps + framework
        finalRecommendation: { type: "string" }, // 2-3 sentences
        triangulation_block: { type: "object" }, // populated by T-PRC-4 when data_gap_severity != 'none'
      }
    }
  }
};
```

3. **Rewire `strategy-brief.ts`** — single `callPerplexity<StrategyBrief>({model: 'sonar-pro', ...})`. No web search filters (the brief synthesizes, it doesn't re-search). If the brief needs a fresh data point that the comp researcher missed, that's a regression test failure, not a runtime fallback.
4. **Strategy brief UI** — every number in `quickMath`, `compEvidence`, `outcomeScenarios.clearing_price`, and `reductionLadder` renders with an inline citation chip pulling from `pricing_runs.citations[citation_idx]`.
5. **PDF-ready render path** — Sonar's `citations` JSONB is the source of truth; the existing brief render component reads it and emits the chips. T-PRC-6 adds the PDF exporter.
6. **Feature flag flip** — once the brief renders correctly on the Big Bing fixture, flip `PRICING_ENGINE_ENABLED=true` and run the 3 regression cases live. Document outcomes.

**Files to touch:**

- `atlas/lib/pricing/prompts/strategy-brief-user.md` (new)
- `atlas/lib/llm/perplexity-schemas.ts` (extend with `StrategyBriefSchema`)
- `atlas/lib/pricing/strategy-brief.ts` (full rewire)
- `atlas/lib/pricing/schemas.ts` (Zod mirror of `StrategyBriefSchema`)
- `atlas/app/pricing/[runId]/_components/strategy-brief-render.tsx` (citation chips)
- `atlas/lib/pricing/__tests__/regression/regression.test.ts` (extend assertions to brief output)

**Done-when:**

- [ ] `strategy-brief.ts` calls `callPerplexity` only
- [ ] Brief output matches `StrategyBriefSchema` exactly (Zod validation passes)
- [ ] Every number on the brief render has an inline citation chip
- [ ] Regression test asserts the Big Bing brief returns Market-Maker classification on the SF lot AND Stretch Rider on inland lot
- [ ] Regression test asserts the 6 GC brief returns Rider with $1,213–1,248/sf midpoint
- [ ] Regression test asserts the 84 SBR brief returns Market-Rider with $7.5M midpoint
- [ ] `pnpm test:golden` green

**Hard Rules check:** Engine untouched. Single provider. ✓

**Stop-and-ask conditions:**

- The brief's `reductionLadder.day0` exceeds `recommendation.best` — that's incoherent. Surface to Viktor.
- The brief recommends Market-Maker classification when closed in-sub-cut > 0 — framework violation. Block render with a StatusDot, do not silently rewrite.

---

## PHASE C — Close the 4 research gaps + ship

T-PRC-4 + T-PRC-5 + T-PRC-6. Estimated 8 pomos. Tag `v6.1.5-pricing.0` at the end.

### T-PRC-4 — Structured triangulation block for data-gap cases [P0, ~3 pomos]

**Spec:**

1. **Prompt file `atlas/lib/pricing/prompts/triangulation-user.md`** — used when `data_gap_severity != 'none'` from the comp-research step. Inputs: the in-sub-cut closed set (may be empty), the in-sub-cut active set, the adjacent sub-cut closed set, and the subject summary.
2. **Schema** — `TriangulationBlockSchema`, attached to `strategy_brief.triangulation_block` (already provisioned in T-PRC-3's schema):

```typescript
{
  in_sub_cut_closed_count: integer,
  in_sub_cut_active_count: integer,
  adjacent_sub_cut_closed_count: integer,
  adjacent_sub_cut_definition: string,
  primary_anchor: { address, price_per_sqft, role, why_chosen },
  secondary_anchors: [ {address, price_per_sqft, role, why_chosen}, ... ],   // 1-3
  derived_band: { low, best, high, per_sqft_or_total: "per_sqft" | "total" },
  band_derivation_logic: string,        // 1 paragraph
  gap_severity: "amber" | "red",
  unresolved_questions: [string]        // surfaced to Viktor for human reconciliation
}
```

3. **Call flow:** After T-PRC-2 (comp research) returns, if `data_gap_severity != 'none'` the engine fires a second Sonar call (`sonar-pro`, same domain filters, with prompt = triangulation template). The response is attached to the run before T-PRC-3 (strategy brief) starts. The strategy brief reads it as input and merges it into the brief as the `triangulation_block` field.
4. **UI** — `/pricing/[runId]` renders the triangulation block as a separate collapsible section above the strategy brief proper, with a StatusDot whose severity matches `gap_severity`.
5. **Regression test:** Big Bing fixture has `data_gap_severity = 'red'` on the SF lot (0 closed in-sub-cut). Assert the triangulation block fires, names 3745 Nassau Point as `primary_anchor`, and derives a band whose midpoint is within 5% of $1,450/sf.

**Files to touch:**

- `atlas/lib/pricing/prompts/triangulation-user.md` (new)
- `atlas/lib/llm/perplexity-schemas.ts` (add `TriangulationBlockSchema`)
- `atlas/lib/pricing/triangulator.ts` (new)
- `atlas/lib/pricing/strategy-brief.ts` (accept optional triangulation input, surface in output)
- `atlas/app/pricing/[runId]/_components/triangulation-section.tsx` (new)
- Regression fixtures updated

**Done-when:**

- [ ] Triangulator fires only when `data_gap_severity != 'none'`
- [ ] Big Bing SF fixture asserts triangulation block fires with 3745 Nassau Point as anchor
- [ ] Triangulation UI renders above the brief proper with severity dot
- [ ] D-071 documented

**Hard Rules check:** Engine untouched. ✓

**Stop-and-ask conditions:**

- Triangulator fires on a case where `data_gap_severity = 'none'` — that's a logic bug. Surface.
- Triangulator names an anchor outside the closed set in either the in-sub-cut or adjacent sub-cut — surface; an active anchor for a Market-Maker classification can only come via T-PRC-5.

### T-PRC-5 — Buyer-migration thesis test via sonar-reasoning-pro [P0, ~3 pomos]

**Spec:**

1. **Prompt file `atlas/lib/pricing/prompts/buyer-migration-thesis-user.md`** — asks: "given the subject sub-cut has < 3 closed comps, and the adjacent sub-cut has X comps with median `$/sf` Y, would the typical buyer of the adjacent sub-cut realistically substitute at the proposed midpoint? Answer Yes/No with named reasoning anchored to closed comps."
2. **Schema `BuyerMigrationThesisSchema`:**

```typescript
{
  thesis_outcome: "supported" | "rejected" | "inconclusive",
  proposed_midpoint_per_sqft: number,
  adjacent_sub_cut_median_per_sqft: number,
  premium_vs_adjacent_pct: number,
  named_comps_supporting: [{address, price_per_sqft, why}],
  named_comps_against: [{address, price_per_sqft, why}],
  reasoning: string,                        // 1-3 paragraphs
  recommended_classification: "stretch_rider" | "market_maker" | "rider",
  walkback: string                          // if rejected — what midpoint WOULD be supported
}
```

3. **Call flow:**
   - Fires when `data_gap_severity = 'red'` (closed in-sub-cut < 3) OR when the engine's draft classification is `market_maker`.
   - Model: `sonar-reasoning-pro` (this is the only call that uses it).
   - Same domain filter as T-PRC-2.
   - Recency: `year` (wider — we want to find rare migration evidence).
   - Timeout: 90s (reasoning models are slower).
4. **Integration** — output is attached to the run as `pricing_runs.buyer_migration_thesis` (JSONB; add column in 0037 if not already there). Strategy brief reads it and weaves the outcome into `whyThisNumber` and `finalRecommendation`.
5. **UI** — collapsed by default on `/pricing/[runId]` with a header "Buyer-migration thesis: SUPPORTED/REJECTED/INCONCLUSIVE", expand reveals the reasoning + named comps. Severity dot maps:
   - `supported` → no dot
   - `inconclusive` → amber dot
   - `rejected` → red dot (blocks rendering of the Market-Maker classification — engine downshifts to Stretch Rider with the walkback midpoint)
6. **Regression test:** Big Bing SF fixture asserts thesis fires, outcome = supported for the $1,450/sf midpoint anchored to 3745 Nassau Point, `premium_vs_adjacent_pct ≈ 0` (since 3745 itself is the adjacent anchor at $1,455/sf).

**Files to touch:**

- `atlas/lib/pricing/prompts/buyer-migration-thesis-user.md` (new)
- `atlas/lib/llm/perplexity-schemas.ts` (add `BuyerMigrationThesisSchema`)
- `atlas/lib/pricing/buyer-migration-thesis.ts` (new)
- `atlas/migrations/0037_comps_provenance.sql` (extend with `pricing_runs.buyer_migration_thesis jsonb` if not already added)
- `atlas/lib/pricing/strategy-brief.ts` (consume thesis output, downshift classification on reject)
- `atlas/app/pricing/[runId]/_components/buyer-migration-section.tsx` (new)

**Done-when:**

- [ ] Thesis call fires on Big Bing SF fixture, returns `supported`
- [ ] Thesis call fires when engine draft classification = Market-Maker
- [ ] Rejected thesis forces classification downshift to Stretch Rider with walkback midpoint
- [ ] UI renders thesis section with severity dot
- [ ] D-071 + D-068 documented (reasoning-pro use justified)

**Hard Rules check:** Engine math untouched. Classification downshift is a presentation gate, not a calc change. ✓

**Stop-and-ask conditions:**

- Thesis returns `supported` for a midpoint > 50% above the adjacent-sub-cut median — that's outside the rider/maker thresholds. Surface; do not allow auto-classify Market-Maker without partner reconciliation.

### T-PRC-6 — Stuck-listing tracker + PDF export + closing PR [P1, ~2 pomos]

**Spec:**

1. **Stuck-listing tracker** — `relist_count`, `first_listed_at`, `current_dom_days` are already populated on comps by T-PRC-2. Add a "Stuck listings" sub-section to the strategy brief listing any in-sub-cut active comp with `current_dom_days > 180` or `relist_count >= 2`. Format: `address · DOM · relist count · current ask`. Renders as a small table inside `marketSentiment` block.
2. **PDF export** — single button "Export brief PDF" on `/pricing/[runId]`. Uses the existing react-pdf stack (already in V5.2). Renders the full strategy brief including:
   - Recommendation L/B/H + classification
   - Comp evidence with inline citations (URLs printed in footnotes)
   - Triangulation block (if present)
   - Buyer-migration thesis (if fired)
   - Reduction ladder
   - Stuck listings
   - Citations bibliography at the end (deduplicated by URL)
   - Run timestamp + Sonar model + cost stamp at the footer

The PDF must read as a board-pack-ready document — no UI affordances, no "click to expand" cues.

3. **Telemetry pass** — query `pricing_llm_calls` and emit a single line per run to a new `atlas/scripts/pricing-telemetry.ts` that Viktor can run locally to see weekly stats:
   - Calls by model
   - Total cost
   - p50/p95 latency
   - Failure rate by call_site
4. **DECISIONS.md** — finalize D-066 through D-073.
5. **Close PR** — tag `v6.1.5-pricing.0`. PR description includes the master checklist below.

**Files to touch:**

- `atlas/app/pricing/[runId]/_components/stuck-listings-table.tsx` (new)
- `atlas/app/pricing/[runId]/_components/brief-pdf.tsx` (new react-pdf doc)
- `atlas/app/pricing/[runId]/_components/export-pdf-button.tsx` (new)
- `atlas/scripts/pricing-telemetry.ts` (new)
- `atlas/docs/DECISIONS.md` (final)
- `atlas/docs/V6_1_TRACKER.md` (add V6.1.5 section noting parallel completion)

**Done-when:**

- [ ] Stuck-listings sub-section renders on `/pricing/[runId]` when applicable
- [ ] PDF export produces a board-pack-ready doc
- [ ] Telemetry script runs locally and surfaces the right stats
- [ ] All D-066 through D-073 final in `DECISIONS.md`
- [ ] Tag `v6.1.5-pricing.0` pushed

**Hard Rules check:** Engine untouched. ✓

---

## 5. Acceptance checklist — V6.1.5 closeout

```
## Phase A — Adapter + audit + retire Anthropic (T-PRC-0, T-PRC-1)
[ ] ACK PR merged
[ ] V6_1_5_AUDIT.md lists every Anthropic call site in atlas/lib/pricing/*
[ ] D-066 through D-073 placeholders in DECISIONS.md (rebased per §0a)
[ ] Cost shadow estimate documented for the Big Bing run
[ ] PERPLEXITY_API_KEY added as Cloudflare Pages secret
[ ] Migration 0036 applied (pricing_llm_calls + pricing_runs.citations) — rebased
[ ] callPerplexity adapter implemented at atlas/lib/llm/perplexity-client.ts
[ ] Adapter writes audit row on success AND failure
[ ] Anthropic imports gone from atlas/lib/pricing/* (grep audit: zero matches)
[ ] Vitest tests cover happy path + 401 + 429 + 500 + timeout
[ ] System prompt validation: throws if "search/find/google" appears

## Phase B — Sonar swap for comp research + brief (T-PRC-2, T-PRC-3)
[ ] Migration 0037 applied (comps provenance + buyer_migration_thesis JSONB) — rebased
[ ] Framework prompts live in atlas/lib/pricing/prompts/*.md
[ ] system-base.md contains the 4 principles + 6 steps + rider/maker thresholds verbatim
[ ] comp-researcher.ts calls callPerplexity only — zero Anthropic imports
[ ] strategy-brief.ts calls callPerplexity only — zero Anthropic imports
[ ] location-classifier.ts calls callPerplexity only — zero Anthropic imports
[ ] Every comp persists source_url, first_listed_at, relist_count, current_dom_days
[ ] pricing_runs.citations populated as JSONB on every successful run
[ ] Brief render shows inline source chips on every number
[ ] Regression test passes for Big Bing (SF $1,100/$1,450/$1,800; inland $650/$850/$1,200)
[ ] Regression test passes for 6 GC ($1,213-1,248/sf base + 21% Osprey premium)
[ ] Regression test passes for 84 SBR ($7.5M base, Market-Rider)

## Phase C — Close research gaps + ship (T-PRC-4, T-PRC-5, T-PRC-6)
[ ] Triangulator fires only when data_gap_severity != 'none'
[ ] Big Bing SF case triggers triangulator, anchors on 3745 Nassau Point
[ ] Buyer-migration thesis fires on red gap OR draft Market-Maker classification
[ ] Buyer-migration thesis uses sonar-reasoning-pro
[ ] Rejected thesis forces classification downshift + walkback midpoint
[ ] Stuck-listings section renders for in-sub-cut actives with DOM > 180 or relist ≥ 2
[ ] PDF export produces a board-pack-ready brief
[ ] Telemetry script surfaces calls by model, cost, p50/p95, failure rate
[ ] All D-066 through D-073 final in DECISIONS.md (rebased per §0a)
[ ] Tag v6.1.5-pricing.0 pushed

## Hard Rules + housekeeping
[ ] pnpm test:golden green on every PR (engine untouched)
[ ] pnpm test:pricing:regression green for all 3 worked examples
[ ] No new UI libraries added (verify package.json — @perplexity-ai/perplexity_ai is the only addition)
[ ] Migrations 0000–0035 unchanged; only 0036–0037 added (rebased per §0a)
[ ] Grep audit: zero Anthropic imports in atlas/lib/pricing/*
[ ] Grep audit: zero inline "[1]"-style citation parsing in atlas/lib/pricing/*
[ ] V6.1 T115 v2 follow-up filed: add Sonar-backed research_comps tool to lib/ask-juno/tools.ts
```

---

## 6. Workflow rules

### 6.1 Branch + PR pattern

- One PR per ticket. No bundling.
- Branch names: `feat/T-PRC-0-audit`, `feat/T-PRC-1-adapter`, ..., `feat/T-PRC-6-close`
- PR description includes:
  - Summary (1 paragraph)
  - Done-when checklist with boxes ticked
  - Screenshots for every UI change (before/after)
  - Hard Rules check section
  - Regression test output paste (Big Bing + 6 GC + 84 SBR — all three)
  - DEVIATION_REGISTER.md update line

### 6.2 Ticket order is mandatory

T-PRC-0 (audit) → T-PRC-1 (adapter) is the foundation. T-PRC-2 + T-PRC-3 can parallelize after T-PRC-1 merges but T-PRC-3 reads from T-PRC-2's `pricing_runs.citations` so the join PR must include both green. T-PRC-4 + T-PRC-5 parallelize after T-PRC-3 merges. T-PRC-6 lands last.

Recommended sequence (post-V6.2):

1. T-PRC-0 (audit) — week 1, day 1–2
2. T-PRC-1 (adapter + retire Anthropic) — week 1, day 3 onward
3. T-PRC-2 (comp research swap) — week 2
4. T-PRC-3 (brief swap) — week 2 end / week 3
5. T-PRC-4 (triangulation) — week 3
6. T-PRC-5 (buyer-migration thesis) — week 3–4
7. T-PRC-6 (stuck-listings + PDF + close) — week 4
8. Tag `v6.1.5-pricing.0` — end of week 4

Total: ~4 weeks.

### 6.3 Critical dependencies

- T-PRC-1 must merge before T-PRC-2, T-PRC-3, T-PRC-4, T-PRC-5.
- T-PRC-2 must merge before T-PRC-3 (brief reads citations populated by comp research).
- T-PRC-3 must merge before T-PRC-4 (triangulation block is a field on the brief schema).
- T-PRC-3 must merge before T-PRC-5 (thesis output is consumed by brief).

### 6.4 Stop-and-ask conditions

In addition to per-ticket conditions:

- Any change to `pricing-framework.ts` (the engine). Hard Rule #1.
- Any package install beyond `@perplexity-ai/perplexity_ai`.
- Any Anthropic call added or restored inside `atlas/lib/pricing/*`. Hard Rule #2.
- Any prompt file containing search instructions ("search for", "find", "google", "look up"). §2.5.
- Any `response_format`-less Sonar call. Hard Rule #5.
- Any silent fallback path (if Sonar fails, try Anthropic, if `sonar-pro` fails, try `sonar`). Hard Rule #6 (fail loud).
- Any change to migrations 0000–0035 (post-V6.2 ceiling).

### 6.5 Definition of done — every ticket

- Code merged to main
- CI green (including `pnpm test:pricing:regression`)
- Manually verified on https://juno-atlas.pages.dev by Viktor or designate — both at least one happy-path run AND one forced-failure run (revoke key, observe StatusDot)
- DEVIATION_REGISTER.md updated
- DECISIONS.md updated where applicable
- Audit log spot-check: latest run's `pricing_llm_calls` rows exist for every `call_site` with `status = 'success'`

---

## 7. Decisions register — D-066 through D-073 *(rebased from D-057 → D-064 per §0a)*

To be inserted into `atlas/docs/DECISIONS.md` (rationale in T-PRC-0 / T-PRC-1):

| ID    | Decision                                                                            | Owner       | Date        | Rationale                                                                                                              |
| ----- | ----------------------------------------------------------------------------------- | ----------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| D-066 | Move pricing engine to Perplexity Sonar end-to-end                                  | Viktor      | 3 Jun 2026  | Closes the 4 research-layer gaps; no max_uses cap; first-class citations[]; JSON schema responses; flat cost.          |
| D-067 | SDK: `@perplexity-ai/perplexity_ai`, fall back to direct fetch where gaps exist     | Claude Code | T-PRC-1     | TBD per smoke test outcome.                                                                                            |
| D-068 | Models: `sonar-pro` standard + `sonar-reasoning-pro` for buyer-migration thesis     | Viktor      | 3 Jun 2026  | Predictable cost; reasoning-pro reserved for the one CoT-benefiting call.                                              |
| D-069 | Citations as JSONB on `pricing_runs.citations` + `comps.source_url`                 | Viktor      | 3 Jun 2026  | Queryable by domain; deduplicable; PDF-export ready.                                                                   |
| D-070 | Framework prompts in `atlas/lib/pricing/prompts/*.md` not code                      | Viktor      | 3 Jun 2026  | Lets Viktor edit prompts without code review; prompt_hash logged per call.                                             |
| D-071 | Buyer-migration thesis as a separate Sonar call (not folded into brief)             | Viktor      | 3 Jun 2026  | One model per call; thesis output is a first-class field, not buried in prose.                                         |
| D-072 | Stuck-listing tracker — relist + DOM + first_listed_at on comps                     | Viktor      | 3 Jun 2026  | Surfaces market dynamics the LLM summary misses.                                                                       |
| D-073 | Fail-loud on Sonar errors — no Anthropic fallback in pricing                        | Viktor      | 3 Jun 2026  | A silent provider routing makes the brief untrustworthy. StatusDot surfaces the failure.                               |

---

## 8. Out of scope for V6.1.5 (deferred)

**Deferred to V6.2 or later:**

- Multi-provider routing in non-pricing surfaces (V6.1 T108 CSV importer + T116 file ingester stay on Anthropic).
- A second-opinion model on the strategy brief (e.g. running both `sonar-pro` and `sonar-reasoning-pro` and reconciling). Optional future enhancement; not justified at current data quality.
- Comp set deduplication across multiple runs of the same project (currently each run is independent).
- Automated weekly recrawl of active comps to refresh `current_dom_days` and `relist_count`. Worth doing in V6.2; out of scope here.
- LP-facing exit-pricing dashboard. The pricing surface stays internal.
- Mobile responsive on the pricing page. Desktop-only, consistent with V6.1.

**Explicitly never in scope:**

- LLM-generated comp data (i.e. "ask the model to invent a comp"). Every comp must have a `source_url` to a real listing.
- Auto-commit L/B/H by the engine. The human commit gate is preserved (framework P4 — facts/judgement/narrative).
- Replacing the partner-disagreement reconciliation step with an LLM call.

---

## 9. Contact + version map

Questions, ambiguities, scope changes → ask Viktor directly. Do not assume.

- **V6.1** = platform editability + Home/Projects/Pipeline UX rebuild + StatusDot + Ask Juno tool-calling agent (shipped, tags `v6.1.0`/`v6.1.1`/`v6.1.2`).
- **V6.1.5** = pricing engine → Perplexity Sonar end-to-end (this doc, tags `v6.1.5-pricing.0`). Deferred until V6.2 ships per §0a.
- **V6.2** = treasury layer — capital sources ledger, portfolio cash schedule, self-funding trajectory, start-capacity solver, scenario modeler, distribution forecast. Builds on the editable platform of V6.1.
- **V6.3** = agent expansion — proactive Ask Juno, strategic interpretation, multi-turn workflows.
- **V7** = governance hygiene.

After V6.1 + V6.2 + V6.1.5, Juno Atlas is the editable, agent-driven, Sonar-grounded strategic cockpit Viktor described.

---

## 10. Three things Viktor must confirm before T-PRC-1 starts

These are V6.1.5 entry gates. Surface as a stop-and-ask in the T-PRC-1 PR until all three are ticked:

1. **`PERPLEXITY_API_KEY` Cloudflare Pages secret is in place.** Confirm via Cloudflare dashboard. Provide the key only via that channel — never paste it into the repo, never in PR description, never in chat.
2. **Decision on the comp domain filter.** §2.5 lists six defaults — confirm or amend. Specifically: should Saunders be in or out (smaller agency, but strong Sound-front presence)? Should the StreetEasy mirror be included?
3. **Decision on feature-flag posture during the swap window.** Per T-PRC-1 §spec.5: either (a) ship the adapter behind `PRICING_ENGINE_ENABLED=false` and flip it on at T-PRC-3 merge, or (b) leave Anthropic live until T-PRC-3 merges then atomic-swap. Option (a) gives a cleaner audit log but leaves the pricing page offline for ~2 weeks. Option (b) keeps it live but means we're running the old engine on the same UI that's expecting new citations. Viktor decides; document as D-073 sub-decision.

If any of these three are unresolved when Claude reaches T-PRC-1, surface as a stop-and-ask before merging.

---

*End of CLAUDE_CODE_INSTRUCTIONS_V6_1_5_PRICING.md.*

*Source: provided by Viktor as a docx 3 Jun 2026. Transcribed to Markdown by Claude with reconciliation notes (§0a) noting it's deferred until V6.2 ships. Decision IDs + migration numbers rebased per §0a. The original docx remains in Viktor's Downloads folder for reference.*
