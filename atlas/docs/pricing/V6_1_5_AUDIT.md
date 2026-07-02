# V6.1.5 — Pricing-path Anthropic audit register (T-PRC-0)

> **Ticket:** T-PRC-0 (discovery — no runtime code). **Date:** 3 Jun 2026. **Repo HEAD:** `9525f31` (tag `v6.2.0`).
> **Purpose:** enumerate every Anthropic call site in the pricing path, the four research-layer gaps each one carries, the schema/table reality the swap must respect, and the rebased migration + decision plan. This is the baseline for T-PRC-1 → T-PRC-6.

---

## 1. Anthropic call-site inventory

### 1a. IN the pricing path → **retire** (T-PRC-1 stub, T-PRC-2/T-PRC-3 rewire to Sonar)

| File                                     | Public export(s)                                                | Anthropic helper                                                                             | Model chain                                                                              | Web search                                                            | `response_format` | Response parsing                                                      | Zod     | Citations surfaced |
| ---------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------- | ------- | ------------------ |
| **`lib/pricing/comp-researcher.ts`**     | `researchComps` (L506), `researchMarketActivity` (L444)         | `callAnthropic` (L278); raw `fetch('https://api.anthropic.com/v1/messages')` (L329)          | `claude-sonnet-4-5` → `claude-3-7-sonnet-latest` → `claude-3-5-sonnet-latest` (L273–275) | `web_search_20250305` name `web_search`, **`max_uses: 5`** (L308–313) | ❌ none           | `extractJson()` (L173) + `JSON.parse()` (L184) — **prose extraction** | ❌ none | ❌ none            |
| **`lib/pricing/location-classifier.ts`** | `classifyLocation` (L244), `parseLocationClassification` (L119) | `callAnthropic` (L172); raw `fetch(...)` (L208)                                              | same chain (L167–169)                                                                    | `web_search_20250305`, **`max_uses: 3`** (L194–197)                   | ❌ none           | `extractJson()` (L112) + `JSON.parse()` (L136)                        | ❌ none | ❌ none            |
| **`lib/pricing/strategy-brief.ts`**      | `generateStrategyBrief` (L663), `stageToPhase` (L878)           | `callClaudeForBrief` (L666); raw `fetch(...)` (L622), `anthropic-version: 2023-06-01` (L627) | same chain (L611–613)                                                                    | ❌ none (synthesis only; `max_tokens: 6000`)                          | ❌ none           | `extractJson()` (L598) + `JSON.parse()` (L741) → `ParsedBriefBody`    | ❌ none | ❌ none            |

**Internal fallbacks present today (the "silent degradation" Hard Rule #2 kills):**

- `comp-researcher.researchComps`: Attempt 1 = web_search beta (L510); on error/empty → Attempt 2 = training-data knowledge call (L542). Returns `{ error: 'Anthropic API error (HTTP …)' }` on hard failure.
- `location-classifier.classifyLocation`: web (L266) → web retry (L271) → knowledge-only (L293).
- These tiered fallbacks are exactly what the plan replaces with **fail-loud** behaviour (§2.1, §2.8).

### 1b. OUTSIDE the pricing path → **STAY on Anthropic** (do NOT touch — §2.1)

| File                                | Owner                                | Why it stays                                                                                                                               |
| ----------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/services/csv-column-mapper.ts` | V6.1 **T108** CSV importer (D-048)   | Explicitly out of scope (§2.1). Raw fetch, same model chain, `ANTHROPIC_API_KEY` (L283).                                                   |
| `lib/ask-juno/tools.ts`             | V6.1 **T115** Ask Juno agent (D-055) | Out of scope. Gets the **T115 v2 follow-up** (`research_comps` tool wrapping `callPerplexity`) → deviation **V6.1.5-001** in the close PR. |

### 1c. T-PRC-0 stop-and-ask check → **CLEAN**

> _"Any Anthropic call site in the pricing path that lives outside `atlas/lib/pricing/_`(e.g. a shared helper in`lib/llm/`)."\*

**None.** All three pricing call sites embed their own `callAnthropic`/`callClaudeForBrief` helper locally inside `lib/pricing/`. There is **no `lib/llm/` directory** today (T-PRC-1 creates it). `csv-column-mapper.ts` and `ask-juno/tools.ts` are independent, non-pricing surfaces. → The retire is cleanly scoped to `lib/pricing/*`; nothing shared needs to move unilaterally.

---

## 2. The four research-layer gaps → call-site mapping

| #   | Gap                                                                                                                | Where it lives today                                                                     | Sonar fix (ticket)                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | **5-search cap** — triangulation in thin sub-cuts hits the ceiling and degrades silently                           | `comp-researcher.ts` `max_uses: 5` (L313); `location-classifier.ts` `max_uses: 3` (L197) | `sonar-pro` — no `max_uses` cap; search priced into tokens (T-PRC-2)                      |
| 2   | **No buyer-migration thesis test** — "stretch" verbiage emitted but adjacent sub-cut never programmatically tested | nowhere — absent from the engine                                                         | `sonar-reasoning-pro` thesis call (T-PRC-5)                                               |
| 3   | **Freeform triangulation** — data-gap reconciliation is prose in the brief, not a structured block                 | `strategy-brief.ts` brief jsonb prose                                                    | `TriangulationBlockSchema` structured block (T-PRC-4)                                     |
| 4   | **Stale / unstructured citations** — Anthropic returns inline prose citations, never surfaced as data              | all three (no `citations` handling anywhere)                                             | top-level `citations[]` → `pricing_briefs.citations` JSONB + `comps.source_url` (T-PRC-2) |

Page-level workaround corroborating gap #4: `app/pricing/page.tsx` 5-year-window comment ("AI-returned comps tend to be 12–24 months old"). Stays, but Sonar `search_after_date_filter` reduces its load.

---

## 3. Schema / table reconciliation (feeds T-PRC-1 + T-PRC-2 migrations)

Two pricing tables exist; the plan conflates them under "pricing_runs":

| Table                                                    | Migration                                         | Role                                                                                                                                                                                | Citation columns land here?                                                       |
| -------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `atlas.pricing_runs` (+ child `pricing_run_comparables`) | `0004`                                            | **Legacy** bottoms-up estimate ("no longer the canonical pricing workflow" — per 0014 comment). Child already has `source_url`.                                                     | ❌ no                                                                             |
| `atlas.pricing_briefs`                                   | `0014` (D-025a)                                   | **Canonical, live.** `brief jsonb`, `used_web_search`, `comp_count`, `data_gap`, `generation_error`, versioned per (project, version). This is what `generateStrategyBrief` writes. | ✅ **yes — DR-A**                                                                 |
| `atlas.comps`                                            | `0017`+ (`dom_days`, grants, waterfront-nullable) | Live comp store.                                                                                                                                                                    | gets `source_url`/`relist_count`/`first_listed_at`/`current_dom_days` in **0037** |

**DR-A decision (to formalise as D-069 at T-PRC-1):** `citations` / `llm_provider` / `llm_total_cost_usd` go on **`pricing_briefs`**, not the legacy `pricing_runs`. `pricing_llm_calls.run_id` references the **brief** id (the unit of a pricing "run" is a brief).

---

## 4. Rebased migrations (per §0a — `0036` + `0037`)

Last migration on disk: `0035_scenarios_starts_per_year_override.sql`. `0036` unused (reserved by V6.2, never written). Both target numbers free. ✅

### `0036_pricing_llm_calls.sql` (T-PRC-1) — DR-A applied

```sql
CREATE TABLE atlas.pricing_llm_calls (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL,                    -- references atlas.pricing_briefs(id)
  call_site     text NOT NULL CHECK (call_site IN
                  ('location_classifier','comp_research','strategy_brief','buyer_migration_thesis')),
  model         text NOT NULL CHECK (model IN ('sonar-pro','sonar-reasoning-pro')),
  status        text NOT NULL CHECK (status IN ('success','failed','rate_limited','timeout')),
  http_status   int,
  error_message text,
  latency_ms    int  NOT NULL,
  input_tokens  int  NOT NULL DEFAULT 0,
  output_tokens int  NOT NULL DEFAULT 0,
  cost_usd      numeric(10,4) NOT NULL DEFAULT 0,
  citations_cnt int  NOT NULL DEFAULT 0,
  prompt_hash   text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON atlas.pricing_llm_calls (run_id);
CREATE INDEX ON atlas.pricing_llm_calls (call_site, status, created_at);

-- DR-A: citations + provider + cost on the CANONICAL brief table (not legacy pricing_runs)
ALTER TABLE atlas.pricing_briefs ADD COLUMN citations          jsonb;
ALTER TABLE atlas.pricing_briefs ADD COLUMN llm_provider       text NOT NULL DEFAULT 'perplexity';
ALTER TABLE atlas.pricing_briefs ADD COLUMN llm_total_cost_usd numeric(10,4) NOT NULL DEFAULT 0;
```

_(plus GRANT + RLS to mirror the existing `pricing_briefs` / `comps` policy set — see migrations `0015`/`0016`/`0018` for the established pattern; new-table GRANT+RLS footgun noted in MEMORY.)_

### `0037_comps_provenance.sql` (T-PRC-2)

```sql
ALTER TABLE atlas.comps ADD COLUMN source_url       text;
ALTER TABLE atlas.comps ADD COLUMN relist_count     int NOT NULL DEFAULT 0;
ALTER TABLE atlas.comps ADD COLUMN first_listed_at  date;
ALTER TABLE atlas.comps ADD COLUMN current_dom_days int;
ALTER TABLE atlas.pricing_briefs ADD COLUMN buyer_migration_thesis jsonb;  -- T-PRC-5 (DR-A: brief, not pricing_runs)
CREATE INDEX ON atlas.comps (first_listed_at) WHERE first_listed_at IS NOT NULL;
```

---

## 5. Decisions register seed — `D-066` → `D-073` (rebased from `D-057`→`D-064`)

Seeded into `DECISIONS.md` as a new V6.1.5 section (placeholders; rationale fleshed out at T-PRC-1 and finalised at T-PRC-6):

| ID    | Decision                                                                                                           | Owner       |
| ----- | ------------------------------------------------------------------------------------------------------------------ | ----------- |
| D-066 | Move pricing engine to Perplexity Sonar end-to-end                                                                 | Viktor      |
| D-067 | SDK: `@perplexity-ai/perplexity_ai` vs direct fetch (decided by T-PRC-1 smoke)                                     | Claude Code |
| D-068 | Models: `sonar-pro` standard + `sonar-reasoning-pro` for buyer-migration thesis                                    | Viktor      |
| D-069 | Citations as JSONB on `pricing_briefs.citations` + `comps.source_url` (**DR-A**: brief, not legacy `pricing_runs`) | Viktor      |
| D-070 | Framework prompts in `lib/pricing/prompts/*.md`, not code                                                          | Viktor      |
| D-071 | Buyer-migration thesis as a separate Sonar call                                                                    | Viktor      |
| D-072 | Stuck-listing tracker — relist + DOM + first_listed_at on comps                                                    | Viktor      |
| D-073 | Fail-loud on Sonar errors — no Anthropic fallback in pricing (+ feature-flag posture sub-decision)                 | Viktor      |

---

## 6. Cost shadow estimate (T-PRC-0 §spec.5)

**Status:** ⛔ **live numbers BLOCKED-ON-VIKTOR** — neither `ANTHROPIC_API_KEY` nor `PERPLEXITY_API_KEY` is present in the local/preflight environment (key is set in the Cloudflare Pages dashboard only, per Gate 1). A live A/B shadow run of the Big Bing case cannot be executed here without inventing numbers, which Hard Rule #4 forbids.

**What is documented now (static analysis):**

- **Per-token prices (plan §2.3):** Sonar Pro `$3` in / `$15` out per 1M; Sonar Reasoning Pro `$2` in / `$8` out per 1M. Web search included — no separate billable, so removing the `max_uses: 5` cap does **not** inflate cost.
- **Brief chain token budget (plan §2.3 estimate):** ~8k input + ~3k output across the chain ⇒ **≈ $0.15–0.18 per brief**, inclusive of the new buyer-migration thesis call. Roughly flat to current Anthropic spend.
- **Anthropic baseline (read from code):** `strategy-brief.ts` `max_tokens: 6000`; comp research + location classifier each make 1–3 calls with web search. Exact token counts require a live run.

**Done-when this becomes a real measurement:** once Viktor confirms `PERPLEXITY_API_KEY` is live, run `scripts/sonar-smoke.ts` (built in T-PRC-1) against the Big Bing fixture and paste the measured latency / tokens / cost back into this section. Tracked as a Viktor-tick item in `V6_1_5_TRACKER.md`.

---

## 7. T-PRC-0 done-when

- [x] Audit doc lists every Anthropic call site in `lib/pricing/*` with file + line ranges (§1a)
- [x] Confirms no pricing-path Anthropic call lives outside `lib/pricing/*` (§1c — clean)
- [x] `D-066` → `D-073` placeholders seeded in `DECISIONS.md` (§5)
- [x] Cost-shadow methodology documented; live A/B run flagged BLOCKED-ON-VIKTOR pending key (§6)
- [x] Schema reconciliation (DR-A `pricing_briefs`) + rebased `0036`/`0037` DDL drafted (§3, §4)
- [ ] _(out-of-band)_ `PERPLEXITY_API_KEY` confirmed live in Cloudflare Pages — Viktor ticks
