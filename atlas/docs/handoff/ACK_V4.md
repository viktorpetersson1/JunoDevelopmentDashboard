# V4 Fix Pack — Acknowledgment

T088-T092: I have read CLAUDE_CODE_INSTRUCTIONS_V4.md.

I understand CI is currently dead (workflow file in wrong path — `atlas/.github/workflows/ci.yml`
instead of repo-root `.github/workflows/ci.yml`; GitHub API confirms zero workflow runs ever).

I understand security headers in `atlas/public/_headers` are NOT live on `juno-atlas.pages.dev`
for Pages-Functions routes (only static assets get them; verified via differential curl).

I will execute T088-T092 in order. I will not start T089 until T088 is green in Actions.
I will not start new feature work until all 5 tickets are merged.
I will request approval from Viktor before any stop-and-ask condition (see V2 §4.2).

## Audit findings before execution (1 June 2026)

A 5-agent verification workflow was run against the live repo + infra + Supabase before
touching any code. Three of the five tickets need scope changes from V4's prescribed plan;
the verified plan is recorded as D-029 in DECISIONS.md and summarized below.

- **T088** — V4 plan correct, bundle a perf-budget bump (15ms → 25ms) in the same commit
  to absorb GitHub Actions runner contention. V4 said 8 jobs; actually 9 (missed `pages-build`).
- **T089** — Reject V4 options A and B. Cloudflare Pages does not apply `_headers` to Pages
  Functions, and `next-on-pages` does not propagate `next.config.mjs headers()` either.
  Ship Option C: middleware-set headers in `lib/supabase/middleware.ts` alongside existing
  `applyCacheHeaders()`. Keep `public/_headers` for static-asset coverage.
- **T090** — V4's `address_pending boolean` column is over-engineering. Use a simpler 4-step
  fix: NULL out placeholder strings (migration 0022, NOT 0023 — V4 numbering is off by one),
  fix `public/data.js` source (also catches a p2 seed drift: "84 Springs Beach Road" / "south_hampton"
  in seed vs corrected "84 Sunset Beach Road" / "sag_harbor" in live DB), regenerate seed,
  add a pre-flight gate to `pricing-strategy-tab.tsx`.
- **T091** — V4's draft SQL is wrong on TWO things: column is `user_id` (not `recipient_id`),
  and `kind` has NO CHECK constraint in prod. Use the introspected canonical SQL.
- **T092** — V4 framing is materially wrong: no `SKIP_KEYS` literal exists; the Excel master
  is not in the repo (decommissioned 2026-05-10 per D-005); the fixture already contains all
  4 keys. The actual gap is engine port (TS `aggregatePortfolio` doesn't compute these), not
  test wiring. Re-scope as 3-5 days of engine work, not "~3 pomos."

## Workflow deviation from V4 §4.1

Per Viktor's standing workflow (memory: "commit logical chunks; push every commit unless told
otherwise" + auto-deploy on `main`) and explicit "go!" authorization at 1 June 2026, the per-
ticket PR ceremony in V4 §4.1 is being skipped. Each ticket still ships as its own logical
commit, but directly to `main` rather than via a feature branch + PR. CI verification + live
curl checks remain non-negotiable.

Signed: Claude Opus 4.8 — 2026-06-01
