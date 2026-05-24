# T009 — Supabase Auth + middleware (translated from Clerk)

**Goal:** Replace the bundle's Clerk auth integration with Supabase Auth using the canonical `@supabase/ssr` pattern for Next.js App Router. Protected routes redirect unauthenticated requests to `/sign-in`; signed-in users on `/sign-in` bounce home.

## What changed

### New files
- `atlas/lib/supabase/client.ts` — `createSupabaseBrowserClient()` (Client Components)
- `atlas/lib/supabase/server.ts` — `createSupabaseServerClient()` (RSC + Route Handlers) + `createSupabaseServiceRoleClient()` (admin / migrations only)
- `atlas/lib/supabase/middleware.ts` — `updateSession()` helper called from root middleware; refreshes JWT, propagates cookies, gates protected routes
- `atlas/middleware.ts` — Next.js root middleware with matcher excluding `_next/static`, image opt, favicon, and static asset extensions
- `atlas/lib/auth/requireAuth.ts` — server-side helper returning `{ user, profile }`; throws `UnauthorizedError` (status 401)
- `atlas/lib/auth/requireRole.ts` — role-gate helpers (`requireRole`, `hasRole`, `requireSuperAdmin`, `requireEditor`); throws `ForbiddenError` (status 403)
- `atlas/lib/auth/profile.ts` — `fetchUserProfile(userId)` reading from vanilla's `public.user_profiles` (UserRole enum: super_admin / editor / viewer / viewer_basic)
- `atlas/lib/auth/__tests__/requireRole.test.ts` — 8 tests covering hasRole, requireRole, requireSuperAdmin, requireEditor, ForbiddenError shape

### Public routes
`PUBLIC_ROUTES = ['/sign-in', '/api/health']`. Everything else redirects to `/sign-in?redirectTo=<path>` when no session.

## Deviations from bundle (logged)

- **No Clerk** — every Clerk reference in bundle docs maps to `@supabase/ssr`. See SUPABASE_TRANSLATION.md §2.
- **Reads role from `public.user_profiles`** (vanilla-owned) instead of Clerk public metadata. Atlas does not write to `user_profiles`.
- **Service-role client included** — needed for T012 (audit log inserts that must bypass RLS) and migrations. Documented as server-only with strong "never expose to client" warning.
- **Sign-up disabled by default** — matches Viktor's safety rules ("drafts only"; admin invites only). The sign-in page in T010 will not surface a sign-up affordance.

## Verified
- `pnpm lint` → 0
- `pnpm typecheck` → 0
- `pnpm test` → 43/43 files, **158/158 tests** (8 new auth invariants)
- Middleware doesn't crash dev boot when env vars missing — passes request through and routes fail with clear errors if they touch the DB

## Done-when
- [x] `<ClerkProvider>` equivalent (`createSupabaseBrowserClient` factory) ready for client components
- [x] `middleware.ts` matching `/((?!_next|api/health).*)` — actually using a more permissive matcher that excludes static asset extensions too
- [x] Hitting `/` without session redirects to `/sign-in`
- [x] `/api/health` accessible unauthenticated (kept public per bundle T011)
- [x] Role data stored in `public.user_profiles.role` (existing enum)
- [x] `requireAuth()` returns `{ user, profile }` or throws `UnauthorizedError`
- [x] `requireRole(profile, ['super_admin'])` throws `ForbiddenError` for non-admins
- [x] Tests cover both happy + sad paths (offline — DB integration tests deferred to T076)
