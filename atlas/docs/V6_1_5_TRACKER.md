# Atlas V6.1.5 — Pricing Engine → Perplexity Sonar · Build Tracker

> **Handle:** `V6.1.5` · **Full name:** _Atlas V6.1.5 — Pricing Engine → Perplexity Sonar (end-to-end provider swap + close the 4 research-layer gaps)_ · **Ships as tag:** `v6.1.5-pricing.0`
>
> **This is the SOLE active Atlas workstream now that `v6.2.0` is tagged.**
>
> - **Planned (source of truth):** [`CLAUDE_CODE_INSTRUCTIONS_V6_1_5_PRICING.md`](CLAUDE_CODE_INSTRUCTIONS_V6_1_5_PRICING.md) — promoted from `backlog/` at kickoff (3 Jun 2026). Original retained in `backlog/`.
> - **Actual:** the Status + Commit columns below — updated as each chunk lands on `main`.
> - **Supersedes nothing** — runs after V6.2 (tag `v6.2.0`, HEAD `9525f31`); see [`V6_2_TRACKER.md`](V6_2_TRACKER.md).
> - **Workflow (Viktor, carried from V5.2/V6.1/V6.2):** direct commits to `main`, push each, CF auto-deploys. **No per-ticket PRs.** (The plan's PR-per-ticket language is superseded by Viktor's direct-to-`main` convention, exactly as V6.2 ran.)
> - **QA gate per ticket:** `npm run typecheck` + `npm run test` (golden 23/23 + full suite stays green) + `npm run lint` + **`npm run preflight`** (with 4 env placeholders). **+ `npm run build`** for any ticket touching a client component (catches server-only imports leaking into client islands). _Baseline at kickoff: 545/545 green, exit 0, HEAD `9525f31`._
> - **Blocked values:** scaffold-build behind a `BLOCKED-ON-VIKTOR` marker; nothing ships to prod with invented numbers or a hardcoded key.
> - **Hard Rules (plan §4):** (1) no engine calc changes — `lib/repos/pricing-framework.ts` + `lib/calc/*` FROZEN, golden 23/23 stays green · (2) **Perplexity is the ONLY LLM provider in `lib/pricing/*`** — no Anthropic fallback, no silent routing · (3) no new UI libs (compose `ja-*` / recharts; the `@perplexity-ai/perplexity_ai` SDK is the one allowed dep) · (4) every Sonar call writes an audit row with `citations_count` + `cost_usd` · (5) every Sonar call uses `response_format` JSON schema (no prose parsing) · (6) citations are top-level array, never inline `[1]` markers · (7) framework prompts live in `lib/pricing/prompts/*.md`, hash logged · (8) the 3 worked examples are the regression suite, run every commit · (9) migrations `0000–0035` FROZEN; V6.1.5 adds **`0036` + `0037` only**.
>
> **Status legend:** ☐ NOT STARTED · ◐ IN PROGRESS · ✅ DONE · ⛔ BLOCKED · ⤵ DEFERRED · ⊘ FOLDED

---

## §0a reconciliation — confirmed against shipped `v6.2.0` (see [`ACK_V6_1_5.md`](ACK_V6_1_5.md) + [`pricing/V6_1_5_AUDIT.md`](pricing/V6_1_5_AUDIT.md))

| # | Rebase / delta | Plan | Shipped V6.2 reality | V6.1.5 takes | Status |
|---|----------------|------|----------------------|--------------|--------|
| 1 | Migrations | `0034`+`0035` | last on disk `0035`; `0036` reserved-unused | **`0036`+`0037`** | ✅ |
| 2 | Decision IDs | `D-057`→`D-064` | `DECISIONS.md` ends `D-065` | **`D-066`→`D-073`** | ✅ |
| 3 | T115 follow-up | n/a | `ask-juno/tools.ts` has no Sonar tool | V6.1.5-001 in close PR | ✅ logged |
| DR-A | Citation column target | `pricing_runs.*` | `pricing_runs` is **legacy**; `pricing_briefs` is canonical/live | columns → **`pricing_briefs`**; `pricing_llm_calls.run_id` → brief id | ✅ resolved (D-069) |
| DR-B | `/pricing/[runId]` route | assumed | **does not exist**; actual = `app/pricing/{page,new,comps,_components}` | UI maps to real structure; per-ticket deviations | ✅ noted |

---

## Ticket status (planned → actual)

| Ticket | Scope (planned) | Pri | Mig | Status | Commit(s) | Notes / blockers |
|--------|-----------------|-----|-----|--------|-----------|------------------|
| **§0** | ACK (`chore: ACK CLAUDE_CODE_INSTRUCTIONS_V6_1_5_PRICING`) — promote plan to `docs/`, add `ACK_V6_1_5.md` + this tracker | P0 | — | ✅ | _(this commit)_ | Plan promoted to `docs/`. ACK signed, §0a reconciliation confirmed (1/2/3 + DR-A/DR-B). Viktor pre-approved via kickoff ("Go"). |
| **T-PRC-0** | Repo scan + audit register + seed `D-066`→`D-073` + cost-shadow methodology | P0 | — | ✅ | _(this commit)_ | [`pricing/V6_1_5_AUDIT.md`](pricing/V6_1_5_AUDIT.md): 3 pricing call sites inventoried (comp-researcher `max_uses:5`, location-classifier `max_uses:3`, strategy-brief no-search); all prose-parse, no `response_format`/Zod/citations. **Stop-and-ask check CLEAN** — no pricing Anthropic call outside `lib/pricing/*`. `D-066`→`D-073` seeded in `DECISIONS.md`. Cost-shadow **live A/B ⛔ BLOCKED-ON-VIKTOR** (no local key) — methodology + static estimate documented; live run is a Viktor-tick. No runtime code. |
| **T-PRC-1** | Perplexity adapter + `PERPLEXITY_API_KEY` + mig `0036` + audit repo + feature flag + vitest | P0 | 0036 | ✅ | _(this commit)_ | **SHIPPED (foundation; Anthropic pricing path left LIVE — option b).** Adapter `lib/llm/perplexity-client.ts` (direct fetch, D-067): `response_format` json_schema, top-level `citations[]` (normalises both `string[]` and object forms), cost from §2.3, typed `PerplexityError`, §2.5 system-prompt search-guard, `AbortController` timeout. **Fail-loud, no fallback** — unit-proven: exactly one fetch, never hits anthropic; missing key = hard error. Audit repo `lib/repos/pricing-llm-calls.ts` (service-role insert, authenticated read). Provider flag `lib/pricing/provider.ts` (`PRICING_LLM_PROVIDER`, default `anthropic`). Schemas `lib/llm/perplexity-schemas.ts` (`CompResearchSchema`). Mig `0036` applied via MCP + on disk: `pricing_llm_calls` + `pricing_briefs.{citations,llm_provider,llm_total_cost_usd}` (DR-A; `llm_provider DEFAULT 'anthropic'` deviation — option-b). 10 vitest cases (happy + 401/429/500/timeout + missing-key + search-guard + non-JSON). `scripts/sonar-smoke.ts` — **live-probe PASSED 3 Jun** (key set in CF production; endpoint `/chat/completions` confirmed, response_format + citations OK). typecheck + lint + preflight clean; **555/555** (+10; golden 23/23). **Anthropic NOT yet removed from `lib/pricing/*`** (option-b → T-PRC-2/3). `PERPLEXITY_API_KEY` CF secret = Viktor-tick. D-067 resolved, D-073 adapter-done. |
| **T-PRC-2** | Swap `researchComps` + `researchMarketActivity` → `sonar-pro`, comp provenance, regression suite | P0 | 0037 | ✅ | _(this commit)_ | **SHIPPED (option-b dual-path; Anthropic still the default).** Mig `0037` applied (comps `relist_count`/`first_listed_at`/`current_dom_days` — `source_url` pre-existed, V6.1.5-007; + `pricing_briefs.buyer_migration_thesis`). Prompts as edge-safe `.ts` modules: `system-base.ts` (verbatim §3.1–3.3) + `comp-research-user.ts` (`{{var}}`, V6.1.5-002) + loader `prompts.ts` (renderTemplate + salted `promptHash`). Zod mirror `schemas.ts` (`CompResearchDataSchema`). `comp-researcher.ts`: both fns branch on `PRICING_LLM_PROVIDER` → `researchCompsViaSonar` (sonar-pro, `compSearchDomains()`, 24-mo date range, Zod-validate, map Sonar→existing `CompResearchOutput`, **psf RECOMPUTED never LLM-supplied**, waterfront enum mapped, citations carried). Fail-loud (no Anthropic fallback; adapter already wrote the failed audit row). comps repo + `/pricing/research` route carry provenance. Regression: 3 fixtures + 6 tests (Big Bing red+3745 Nassau/5235 Bridge psf±2%, 6 GC none+16 Osprey/11 Sunnyside, 84 SBR amber+12 Ferry, psf-recompute, waterfront-map, flag-off-skips-Sonar). typecheck+lint+test(**561**, +6)+preflight+build clean; golden 23/23. **Anthropic NOT removed** (V6.1.5-003); **citation persistence + per-$/sqft source chips → T-PRC-3** (V6.1.5-006 — comp research runs inside `generateStrategyBrief`). D-070 resolved; D-069 partial. |
| **T-PRC-3** | Swap `generateStrategyBrief` (`callClaudeForBrief`) → `sonar-pro` + `response_format` JSON schema + citation chips + flag flip | P0 | — | ☐ | — | `StrategyBriefSchema` + Zod mirror. Brief render citation chips. Flip `PRICING_ENGINE_ENABLED=true` after Big Bing fixture passes. **Client render → `npm run build`.** Depends on T-PRC-2 (reads `pricing_briefs.citations`). |
| **T-PRC-4** | Structured triangulation block for data-gap cases (`sonar-pro`) | P0 | — | ☐ | — | `triangulator.ts` fires only when `data_gap_severity != 'none'`. `TriangulationBlockSchema`. Big Bing SF (0 closed in-sub-cut) → anchors 3745 Nassau Point. Depends on T-PRC-3 (block is a brief field). |
| **T-PRC-5** | Buyer-migration thesis via `sonar-reasoning-pro` | P0 | — | ☐ | — | `buyer-migration-thesis.ts`. Fires on `red` gap OR draft `market_maker`. Rejected thesis → downshift to stretch_rider (presentation gate, not calc). 90s timeout. Depends on T-PRC-3. |
| **T-PRC-6** | Stuck-listing tracker + PDF export + telemetry + closing PR + tag | P1 | — | ☐ | — | Stuck-listings (DOM>180 or relist≥2). PDF via existing react-pdf path (**verify it exists** — DR-B: plan assumes V5.2 react-pdf stack). `scripts/pricing-telemetry.ts`. Finalise `D-066`→`D-073`. **Tag `v6.1.5-pricing.0`.** File V6.1.5-001 (Ask Juno `research_comps`). |

Migration allocation: **0036** `pricing_llm_calls` + `pricing_briefs` citation/provider/cost cols (T-PRC-1) · **0037** `comps` provenance + `pricing_briefs.buyer_migration_thesis` (T-PRC-2/5).

---

## Entry gates (plan §10) — surface until ticked

| Gate | Item | Posture | Status |
|------|------|---------|--------|
| **1** | `PERPLEXITY_API_KEY` Cloudflare Pages secret | Set in `juno-atlas` **production** via `wrangler pages secret put` (3 Jun; `secret_text`; 6 existing secrets intact). Live-probe validated: 200 on `https://api.perplexity.ai/chat/completions` (no `/v1`), `response_format` json_schema + citations OK. **Provider flag NOT flipped** — Sonar stays off until T-PRC-3 verifies. ⚠ key exposed in chat → ROTATE recommended. | ✅ set + validated |
| **2** | Comp domain filter | Default 6 (`zillow, redfin, compass, douglaselliman, corcoran, saunders`), tunable via `PRICING_COMP_DOMAINS`. Saunders IN, StreetEasy OUT. | ◐ proceeding on default; confirm at T-PRC-2 |
| **3** | Feature-flag posture | **Option (b)** — Anthropic live until Sonar verified, then atomic flag flip. Interim fallback = flag-OFF state, not silent runtime routing. | ✅ confirmed ("C") |

> The shipped flag-ON state has **no Anthropic in the pricing path** (Hard Rule #2). The "fall back to Anthropic" during the build window is the flag-OFF posture only.

---

## Critical dependencies (plan §6.3)

- **T-PRC-1** before T-PRC-2, T-PRC-3, T-PRC-4, T-PRC-5 (everyone needs the adapter).
- **T-PRC-2** before T-PRC-3 (brief reads `pricing_briefs.citations`).
- **T-PRC-3** before T-PRC-4 (triangulation block is a brief-schema field) and before T-PRC-5 (thesis consumed by brief).
- **T-PRC-6** lands last → tag `v6.1.5-pricing.0`.

## Definition of done — every ticket (plan §6.5)

1. Merged to `main` · 2. `npm run test` green incl. golden 23/23 + regression (Big Bing / 6 GC / 84 SBR) · 3. **Preflight green** (edge-runtime drift) · 4. `npm run build` green for client-touching tickets · 5. Verified on https://juno-atlas.pages.dev (happy-path + forced-failure StatusDot) — gated on Gate 1 · 6. `DEVIATION_REGISTER.md` updated · 7. `DECISIONS.md` updated where applicable · 8. Audit spot-check: `pricing_llm_calls` rows exist for every `call_site` with `status='success'`.

---

## Acceptance checklist — V6.1.5 closeout (plan §5)

```
## Phase A — Adapter + audit + retire Anthropic (T-PRC-0, T-PRC-1)
[x] §0a reconciliation confirmed (migrations 0036/0037, decisions D-066→D-073, DR-A/DR-B)
[x] V6_1_5_AUDIT.md lists every Anthropic call site in lib/pricing/*
[x] D-066 through D-073 placeholders in DECISIONS.md (rebased per §0a)
[~] Cost shadow estimate documented (live A/B BLOCKED-ON-VIKTOR — no local key)
[x] PERPLEXITY_API_KEY added as Cloudflare Pages secret (3 Jun, wrangler, secret_text; 6 siblings intact) + live-probe validated
[x] Migration 0036 applied (pricing_llm_calls + pricing_briefs citation/provider/cost — DR-A)
[x] callPerplexity adapter implemented at lib/llm/perplexity-client.ts
[x] Adapter writes audit row on success AND failure
[~] Anthropic imports gone from lib/pricing/* — deferred to T-PRC-2/3 per option (b); adapter ready
[x] Vitest tests cover happy path + 401 + 429 + 500 + timeout (10 cases)
[x] System prompt validation: throws on "search"/"google" (word-boundary; "find" omitted to avoid false positives on analytical language)

## Phase B — Sonar swap for comp research + brief (T-PRC-2, T-PRC-3)
[x] Migration 0037 applied (comps provenance + pricing_briefs.buyer_migration_thesis)
[x] Framework prompts live in lib/pricing/prompts/ (.ts modules — V6.1.5-002)
[x] system-base.ts contains the 4 principles + 6 steps + rider/maker thresholds verbatim
[~] comp-researcher.ts calls callPerplexity (dual-path, flag-gated); strategy-brief + location-classifier → T-PRC-3; Anthropic kept live per option-b (V6.1.5-003)
[x] Every comp persists source_url, first_listed_at, relist_count, current_dom_days (repo + research route)
[~] pricing_briefs.citations populated → T-PRC-3 (brief insert is the persistence point; V6.1.5-006)
[~] Brief + comp source chips → T-PRC-3 (V6.1.5-006); comp-library provenance badge pre-exists
[~] Regression: comp-research mapping passes for all 3 (named anchors + psf±2% + gap severity); brief-level $-band classification asserted in T-PRC-3

## Phase C — Close research gaps + ship (T-PRC-4, T-PRC-5, T-PRC-6)
[ ] Triangulator fires only when data_gap_severity != 'none'; Big Bing SF → 3745 Nassau Point anchor
[ ] Buyer-migration thesis fires on red gap OR draft market_maker; uses sonar-reasoning-pro
[ ] Rejected thesis forces classification downshift + walkback midpoint
[ ] Stuck-listings section renders for in-sub-cut actives DOM>180 or relist>=2
[ ] PDF export produces a board-pack-ready brief
[ ] Telemetry script surfaces calls by model, cost, p50/p95, failure rate
[ ] All D-066 through D-073 final in DECISIONS.md
[ ] Tag v6.1.5-pricing.0 pushed

## Hard Rules + housekeeping
[ ] golden 23/23 green on every commit (engine untouched)
[ ] No new UI libraries (package.json — @perplexity-ai/perplexity_ai is the only addition)
[ ] Migrations 0000–0035 unchanged; only 0036–0037 added
[ ] Grep audit: zero Anthropic imports in lib/pricing/*
[ ] Grep audit: zero inline "[1]"-style citation parsing in lib/pricing/*
[ ] V6.1 T115 v2 follow-up filed (V6.1.5-001): Sonar research_comps tool in lib/ask-juno/tools.ts
```

---

## V6.2 reference

For the prior sprint's close-out (Treasury Layer, T118–T127, tag `v6.2.0`), see [`V6_2_TRACKER.md`](V6_2_TRACKER.md). Open V6.2 BLOCKED-ON-VIKTOR carry-forwards (VB-1 LOC covenant, VB-2 Harrison facility, VB-3 owner↔auth links) are **not** V6.1.5 scope.
