# Juno Atlas — Claude Code Instructions V4 (Board-Readiness Fix Pack)

**Owner:** Viktor Petersson (KP Confidencia / Juno)
**Date:** 1 June 2026
**Supersedes scope of:** none — this is a focused fix pack riding on top of V3
**Status:** GO — execute T088–T092 in order. Pause all new feature work until all 5 are merged and green.

---

## 0. ACK first — do not skip

Before touching any code:

1. Read this document end-to-end.
2. Open a PR titled `chore: ACK CLAUDE_CODE_INSTRUCTIONS_V4`. The PR adds nothing except this file at `atlas/docs/CLAUDE_CODE_INSTRUCTIONS_V4.md` and an `ACK_V4.md` containing:

```
T088-T092: I have read CLAUDE_CODE_INSTRUCTIONS_V4.md.
I understand CI is currently dead (workflow file in wrong path).
I understand security headers in atlas/public/_headers are NOT live on juno-atlas.pages.dev.
I will execute T088-T092 in order. I will not start T089 until T088 is green in Actions.
I will not start new feature work until all 5 tickets are merged.
I will request approval from Viktor before any stop-and-ask condition (see V2 §4.2).

Signed: Claude (instance + date)
```

3. Wait for Viktor to merge ACK. Then start T088.

---

## 1. Context — what this fix pack closes

Viktor commissioned a fresh audit on 1 June 2026 against V2 (21 May) and V3 (26 May). The audit found:

- **CI has never run.** `atlas/.github/workflows/ci.yml` lives in a subdirectory. GitHub Actions only reads `.github/workflows/` at the repository root. **Zero workflow runs in Actions history.** Every quality gate is decorative.
- **Security headers are not live.** Curl against `https://juno-atlas.pages.dev/sign-in` returns NONE of the CSP, HSTS, X-Frame-Options, Referrer-Policy, or Permissions-Policy headers that the committed `atlas/public/_headers` file declares. The `_headers` file is not being applied by Cloudflare Pages — almost certainly because the Pages publish directory doesn't match where `_headers` sits in the repo.
- **8 of 10 projects still have address `"TBC"`** in `atlas/scripts/seed-baseline-projects.sql`. The Pricing strategy tab (D-025a, D-025b, D-026) needs a real address to function — meaning 80% of the portfolio's headline new feature is non-functional.
- **`atlas.notifications` table has no committed migration.** It exists in prod but isn't reproducible from `atlas/migrations/`.
- **Waterfall + LP analysis are explicitly skipped in golden tests** (`atlas/tests/golden/portfolio.golden.test.ts`). The exact KPIs board members will cross-check first are not calc-verified against the Excel master.

These 5 issues are the board-credibility critical path. Vendors (B.3) and Excel import (C.1) are explicitly **deferred** — do not work on them in this sprint.

---

## 2. The four Hard Rules — still in force

From V2 §1.2 — reaffirmed:

1. Never remove an input that exists in the Excel master.
2. Never change a calc formula without a passing golden-master test (≤0.5% tolerance vs Excel).
3. No new UI libraries. Compose from `ja-*` primitives.
4. No project-status transition without an approval snapshot row.

And Viktor's safety rules from his standing instructions: read-only by default, no external communications without explicit approval, all data confidential, no bulk irreversible actions without sample-and-confirm.

---

## 3. Tickets — execute in order

T088 — Move CI to repo root (P0, ~0.5 pomo)
T089 — Make security headers actually live (P0, ~2 pomos)
T090 — Resolve 8 "TBC" project addresses (P0, ~2 pomos)
T091 — Commit the notifications migration (P1, ~1 pomo)
T092 — Wire waterfall + LP analysis into golden tests (P1, ~3 pomos)

See the original instructions sent in chat on 1 June 2026 for the full per-ticket spec. The corrected execution plan (verified by a fresh audit on the same day) is captured in DECISIONS.md as D-029.

---

## 4. Workflow rules

### 4.1 Branch + PR pattern

- One PR per ticket. No bundling.
- Branch names: `feat/T088-ci-root-move`, `feat/T089-headers-live`, `feat/T090-tbc-resolution`, `feat/T091-notifications-migration`, `feat/T092-waterfall-golden`
- PR titles match the branch slug.

**Deviation:** Viktor's standing workflow is direct commits to `main` with CF Pages auto-deploy. The PR ceremony in §4.1 is being skipped for this fix pack per Viktor's authorization ("go!" 1 June 2026). Each ticket still ships as its own logical commit, just to `main` directly.

### 4.2 Ticket order is mandatory

T088 first. The other 4 tickets cannot be properly verified until CI is running, because every claim of "green" or "passing" needs to be backed by a CI run anyone can replay. Do not parallelize.

### 4.3 Stop-and-ask conditions

- Any test failure that points to a real engine regression — stop, do not patch the test
- Any change to `atlas/migrations/0000`–`0021` (frozen, only add new ones)
- Any change to the locked stack (Next.js 14 + Supabase + Cloudflare Pages)
- Any package install beyond what's strictly needed for the ticket

### 4.4 Definition of done — every ticket

1. Code merged to `main`
2. CI green (now that CI actually runs)
3. Manually verified on the live URL `https://juno-atlas.pages.dev` (Viktor or his designate)
4. `DEVIATION_REGISTER.md` updated
5. `DECISIONS.md` updated for any decision touched (D-013 in T092 in particular)

---

## 5. Viktor's parallel action — runbook for Peter, Lars, and one other

Draft a one-page login + first-time-use runbook covering: URL, invite flow, first surfaces to look at, how to flag issues, what to expect over the next 2 weeks. Get it into Peter, Lars, and one other owner's hands within 5 business days of T092 merging.

---

## 6. Final acceptance checklist

See V4 §6 in the original chat message — Viktor runs the 10-box checklist personally before declaring V4 done.

---

## 7. Contact

Questions, ambiguities, scope changes → ask Viktor directly. V4 closes the trust gap. After V4, the next instruction set will be a feature-roadmap document, not a fix pack.
