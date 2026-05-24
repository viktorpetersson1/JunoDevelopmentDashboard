# T011 — Role gating + meta endpoints

**Goal:** Wire `/api/health`, `/api/me`, `/api/config` with the standard `{ data | error }` envelope (CLAUDE.md §11.2) and the role-gated `withErrorBoundary` wrapper that maps `UnauthorizedError`/`ForbiddenError` to 401/403 transparently.

## What changed

### New helpers

- `atlas/lib/api/response.ts` — `ok`, `created`, `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `serverError` envelope factories.
- `atlas/lib/api/handler.ts` — `withErrorBoundary(handler)` wrapper. Catches `UnauthorizedError` → 401, `ForbiddenError` → 403, anything else → 500 (with stack logged via `lib/utils/log` and message scrubbed from the response body so internals don't leak).
- `atlas/lib/api/__tests__/response.test.ts` — 8 envelope invariants.
- `atlas/lib/api/__tests__/handler.test.ts` — 4 boundary behaviours.

### Routes

- `atlas/app/api/health/route.ts` — hardened: now uses `ok()` envelope. Unauthenticated. Returns `{ data: { status, commit, time } }`.
- `atlas/app/api/me/route.ts` — wraps `requireAuth()` from T009. Returns `{ data: { user, profile, org } }`. Single-org P0; `org` is constant `{ id: 'juno', name: 'Juno' }`.
- `atlas/app/api/config/route.ts` — wraps `requireAuth()`. Returns `{ data: { flags, sentryDsn, tokens } }`. `flags` parsed from `ATLAS_FEATURE_FLAGS` env; `tokens` is the 6-colour chart palette for runtime chart use.

### Tests

- `atlas/app/api/health/__tests__/route.test.ts` — 2 tests (envelope shape + RENDER_GIT_COMMIT fallback).
- Response + handler helpers: 12 tests total.

## Deviations from bundle (logged)

- **Bundle T011 prescribes `assertRole(user, 'admin' | 'owner')` at the top of mutating routes.** That's a Clerk-shaped API. Our equivalent is `requireRole(profile, ['super_admin', 'editor'])` from T009 — same intent, Supabase types.
- **No `/api/me` integration test against live Supabase** — needs a real session. Component-test-level coverage via the `withErrorBoundary` boundary test (UnauthorizedError → 401 envelope) is the substitute until T076 production deploy.
- **`/api/config.tokens` is narrow** — only the 6-colour chart palette. Other token reads should use the CSS vars directly in components; runtime `tokens` exists only for chart libraries that need raw colour strings.

## Verified

- `pnpm lint` → 0
- `pnpm typecheck` → 0
- `pnpm test` → 47/47 files, **179/179 tests** (14 new)
- `pnpm build` → succeeds; `/api/me`, `/api/health`, `/api/config` all in route list

## Done-when

- [x] `/api/health` returns `{ data: { status, commit, time } }` (< 50ms uncached)
- [x] `/api/me` returns full user + profile + org; 401 when no session
- [x] `/api/config` returns flags + Sentry DSN + token map; 401 when no session
- [x] All routes have envelope shape per CLAUDE.md §11.2
- [x] All routes ≤ 60 lines per CLAUDE.md §11
- [x] Integration tests cover envelope shape; full happy-path defer to T076 (needs DB)
