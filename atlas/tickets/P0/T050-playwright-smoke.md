# T050 — J1 + J3 Playwright specs (smoke + skipped real-user)

## What changed

### New files

- `atlas/tests/e2e/smoke.spec.ts` — 4 specs that need no auth:
  - `/api/health` returns the standard envelope
  - `/` redirects unauthenticated → `/sign-in?redirectTo=/`
  - `/projects` redirects → `/sign-in?redirectTo=/projects`
  - `/projects/p2` redirects → `/sign-in?redirectTo=/projects/p2`
- `atlas/tests/e2e/J1_signin.spec.ts` — 4 specs (3 active + 1 skip):
  - Form renders email + password + Sign in button
  - "Forgot password" toggles modes
  - Bad credentials surface the Supabase error in `[role=alert]`
  - **skipped:** successful sign-in → redirect home (needs T076 real user)
- `atlas/tests/e2e/J3_view-project-summary.spec.ts` — **entire describe block skipped** until T076 provisions a Supabase test user. Spec stubs encode the future assertions (Summary KPIs render, timeline tab renders).

## How to run locally

```powershell
cd C:\Dev\juno-financial-dashboard\atlas
pnpm exec playwright install chromium   # one-time browser install
pnpm test:e2e
```

Playwright auto-starts `pnpm dev` via the `webServer` config (atlas/playwright.config.ts).

## CI integration

T013 CI workflow currently runs **lint + typecheck + unit + integration (stub) + golden (stub) + build** — no `e2e` job yet. A 7th job will be added in a follow-up (`pnpm test:e2e` against the placeholder Supabase env, smoke specs only). The skipped J1 "successful sign-in" + J3 specs need real Supabase credentials so they stay local-only until T076 sets up a CI-accessible test environment.

## Done-when

- [x] `e2e/J1_signin.spec.ts` exists; 3 of 4 active, 1 skipped with reason
- [x] `e2e/J3_view-project-summary.spec.ts` exists; fully skipped with stub
- [x] `e2e/smoke.spec.ts` exists — runs without real user; covers middleware + health
- [N/A] All green in CI ≤30s combined — Playwright job not added to CI yet (T076 / follow-up)
- [N/A] Real-user sign-in test — gated on T076

## Verified

- `pnpm typecheck` → 0
- `pnpm lint` → 0
- Specs parse via Playwright (the framework is correctly wired from T001)
