# ACK — CLAUDE_CODE_INSTRUCTIONS_V6_1_5_PRICING

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

Signed: Claude (claude-opus-4-8) — 3 June 2026, V6.1.5 kickoff
```

---

## §0a reconciliation — confirmed against the shipped `v6.2.0` state

The plan was authored before V6.1/V6.2 closed. I verified the three rebases against the now-shipped repo (HEAD `9525f31`, tag `v6.2.0`):

| #   | Rebase             | Plan said                | Shipped V6.2 reality                                                                                                                | V6.1.5 takes                                                 | Status                              |
| --- | ------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------- |
| 1   | **Migrations**     | `0034` + `0035`          | V6.2 applied `0033`/`0034`/`0035`; last file on disk is `0035_scenarios_starts_per_year_override.sql`; `0036` never used (reserved) | **`0036` + `0037`**                                          | ✅ confirmed — both free            |
| 2   | **Decision IDs**   | `D-057` → `D-064`        | `DECISIONS.md` ends at **`D-065`** (V6.2 T126)                                                                                      | **`D-066` → `D-073`**                                        | ✅ confirmed — `D-066` is next free |
| 3   | **T115 follow-up** | n/a (plan predates T115) | T115 shipped (`D-055`) with raw Anthropic tools; `lib/ask-juno/tools.ts` has **no** Sonar `research_comps` tool                     | T115 v2 follow-up → **deviation V6.1.5-001** in the close PR | ✅ logged                           |

### Two additional deltas discovered during the T-PRC-0 scan (not in the plan's §0a)

These are documented in full in [`pricing/V6_1_5_AUDIT.md`](pricing/V6_1_5_AUDIT.md) and tracked in [`V6_1_5_TRACKER.md`](V6_1_5_TRACKER.md):

- **DR-A — citation column target.** The plan writes `citations` / `llm_provider` / `llm_total_cost_usd` to `pricing_runs`. But `pricing_runs` (mig `0004`) is the **legacy** bottoms-up table ("no longer the canonical pricing workflow"); the **live** recommendation table the engine actually writes is `pricing_briefs` (mig `0014`, D-025a). Migration `0036` will target **`pricing_briefs`**, and `pricing_llm_calls.run_id` will reference the brief id. Resolved + rationalised under D-069 at T-PRC-1.
- **DR-B — no `/pricing/[runId]` route.** The plan's UI specs reference `app/pricing/[runId]/_components/*`. That route does **not** exist. Actual surface is `app/pricing/page.tsx` + `app/pricing/new/` + `app/pricing/comps/` + `app/pricing/_components/{comp-provenance-badge,market-intel}.tsx` (a comp-provenance badge already exists). UI work maps onto the real structure; logged per-ticket as deviations.

### Entry gates (plan §10) — kickoff posture

Per Viktor's kickoff direction:

- **Gate 1 — `PERPLEXITY_API_KEY`:** set by Viktor in the **Cloudflare Pages dashboard only** (never in repo/PR/chat). Not present in the local/preflight environment, so live Sonar smoke + live regression cannot run here. **Build behind a `BLOCKED-ON-VIKTOR` marker**: scaffold the Sonar path, keep the existing Anthropic path live as the flag-off state, never invent outputs, never hardcode a key. Live verification = a Viktor-tick checkbox. **(Confirmed — "A")**
- **Gate 3 — feature-flag posture:** **option (b)** — leave Anthropic live until the Sonar path is verified, then atomic-swap by flipping the flag. The interim "fall back to Anthropic" is the flag-OFF state during the build window, **not** a silent runtime fallback; the shipped flag-ON state has no Anthropic in the pricing path (Hard Rule #2 holds). **(Confirmed — "C")**
- **Gate 2 — comp domain filter:** proceeding with the plan's documented 6-domain default (`zillow, redfin, compass, douglaselliman, corcoran, saunders`), made tunable at runtime via `PRICING_COMP_DOMAINS` (no code change to adjust). Saunders kept in (strong Sound-front presence); StreetEasy mirror left out (Manhattan-centric). Will surface for explicit confirmation at T-PRC-2 where it binds.

Reconciliation done. Proceeding to T-PRC-0 (audit register) — discovery only, no runtime code.
