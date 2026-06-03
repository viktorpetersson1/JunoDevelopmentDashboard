# ACK — CLAUDE_CODE_INSTRUCTIONS_V6_2

```
T118–T127: I have read CLAUDE_CODE_INSTRUCTIONS_V6_2.md.
V6.1 (T104–T117) is merged at tag v6.1.2 and live on CF Pages — confirmed.
I understand V6.2 has TWO parts:
  PART 1 (T118–T122): Treasury foundation — Capital Sources ledger,
                      Portfolio 36-month cash schedule, KPC LOC repayment,
                      Start Capacity Solver.
  PART 2 (T123–T127): Strategic answers — Self-Funding Trajectory,
                      Scenario Modeler, Distribution Forecast, Boardroom
                      wiring, close PR.
I will not start T123 until T118–T122 are merged (Part 2 reads Part 1's data).
I will not break the six Hard Rules (V6.1 §4 + V6.2 §3b new rule #6):
  1. No removed Excel inputs
  2. No calc-engine changes without passing golden-master test
  3. No new UI libraries — compose from ja-* primitives
  4. No stage transition without approval snapshot
  5. No write API without role check, audit log, re-approval gate
  6. NEW V6.2: No covenant calculation without a written formula + golden test
I understand the treasury layer is presentation + aggregation only.
  The calc engine still emits monthly debt_drawn / debt_repaid / debt_balance
  per project. V6.2 SUMS those series against the capital_sources ledger.
I will treat the UX/UI principles in §3a + the Treasury principles in §3b
  as non-negotiable.
I will run pnpm run preflight (with env vars) as part of per-ticket QA —
  alongside typecheck/test/lint — to catch CF-Pages edge-runtime drift before
  push (lesson from V6.1: missing this preflight gate caused v6.1.0 to never
  deploy; v6.1.1 was the actual first-deploy commit).
I will request Viktor's approval before any stop-and-ask condition.

Signed: Claude (Opus 4.7) — 2026-06-03
```

---

## Pre-flight ground-truth (verified against repo at `9b92284`, 2026-06-03)

- HEAD `9b92284` on `main`, working tree clean. Tags `v6.1.0`, `v6.1.0-beta.1`, `v6.1.1`, `v6.1.2` present. ✓
- V6.1 closed and DEPLOYED at `v6.1.2` (commit `1094d41`). Live at https://juno-atlas.pages.dev — Viktor confirmed (option C).
- V6.1 QA agent ran clean post-fixes: 0 BLOCKERS, all 5 Hard Rules PASS. 479/479 tests, typecheck + lint clean.
- V6.2 plan-of-record staged at `d730d74` (`atlas/docs/CLAUDE_CODE_INSTRUCTIONS_V6_2.md`). DRAFT label removed when this ACK is merged.
- V6.1.5 Pricing Sonar plan stored in backlog at `9b92284` — explicitly deferred until V6.2 ships.

## Blockers flagged before T118 (§9 stop-and-ask)

Per V6.2 §9, three numbers are needed before treasury tickets can start:

1. **KPC LOC covenants** — for T118 + T122 (Start Capacity Solver):
   - `covenant_max_ltc_pct` (decimal — e.g. 0.75 for 75%)
   - `covenant_max_concurrent_projects` (integer — max projects this LOC can fund concurrently)
   - `draw_window_start_date` / `draw_window_end_date` (or "no window")
   - **Status:** ⛔ BLOCKED on Viktor's term sheet.
2. **Harrison Senior facility terms** — for T118 (seed second `capital_sources` row):
   - `limit_usd`, `drawn_usd`, `interest_rate_pct`
   - `covenant_max_ltc_pct`, draw window if any
   - Priority order relative to KPC LOC (Harrison Senior typically drawn AFTER KPC LOC for project finance — confirm)
   - **Status:** ⛔ BLOCKED on Viktor confirming the facility exists / providing terms. If no Harrison facility, T118 ships with KPC LOC + `recycled_equity` only; T119/T122 still work.
3. **Owner ↔ Supabase user_id linkage for 6 remaining owners** — for T125 (Distribution Forecast per-owner row visibility):
   - Peter, Lars, Philip, Missy, Massi, Mark — need provisioned Supabase auth accounts with `atlas.owners.email` linked.
   - **Status:** ⛔ BLOCKED. T125 can ship a super-admin-only view that hides per-owner rows for unlinked owners with "Pending account" placeholder; full enforcement of §2.7 visibility requires the links. **Recommendation:** Viktor decides per owner whether to (a) provision now, (b) hide row for that owner, (c) show row but pre-aggregated.

**None of these three block T118 kickoff** — they're surfaced as stop-and-ask before the specific commits that need them. T118's first PR (schema + repo) can ship with placeholder values that read `BLOCKED-ON-VIKTOR` (V5.2 precedent) so the structure is in place while waiting on numbers.

## Sequencing reminder

Recommended start order per V6.2 §6.2:

1. **T118 week 1** — Capital Sources ledger schema (migrations 0033 + 0034) + repo + Settings editor
2. **T119 week 2** — Multi-lender project Inputs editor (Capital sources section)
3. **T120 week 2–3** — Portfolio 36-month cash schedule (aggregator + page)
4. **T121 week 3** + **T122 week 3** parallel — LOC repayment + Start capacity
5. Tag `v6.2.0-beta.1` end of week 4
6. **T123 week 5** + **T125 week 5** parallel — Self-funding + Distribution forecast
7. **T124 week 5–6** — Scenario modeler
8. **T126 week 6** — Boardroom wiring + reconciliation tests
9. **T127 week 7** — Close + tag `v6.2.0`

Total: ~7 weeks focused. Same shape as V6.1.

Paused for Viktor's merge of this ACK before starting T118.
