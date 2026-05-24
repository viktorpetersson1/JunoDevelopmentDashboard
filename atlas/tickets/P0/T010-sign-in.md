# T010 — Sign-in page (translated from Clerk)

**Goal:** Custom sign-in form at `/sign-in` against Supabase Auth using the design-system primitives. Sign-in + reset-password flows; sign-up disabled per safety rules.

## What changed

### New files

- `atlas/app/sign-in/page.tsx` — Server Component shell; reads `redirectTo` + `error` from `searchParams`; renders the client form on a card-on-sunken-bg layout.
- `atlas/app/sign-in/sign-in-form.tsx` — `'use client'` form with two modes (sign-in / reset). Uses atlas/components/ui Input + Button. Submits via `createSupabaseBrowserClient()` from T009.
- `atlas/app/sign-in/__tests__/sign-in-form.test.tsx` — 7 tests covering both modes, success + failure paths, mode toggle, and initial-error-from-URL pass-through.

### Behaviour

- Sign-in: email + password → `signInWithPassword` → router.push(redirectTo) on success; inline error on failure
- Reset: email → `resetPasswordForEmail` → status confirmation
- Mode toggle: "Forgot password?" / "Back to sign in" links
- No sign-up affordance (admin invite only per Viktor's safety rules)

### Test approach

The Supabase browser client is stubbed via `vi.mock('@/lib/supabase/client', ...)` and Next router via `vi.mock('next/navigation', ...)`. We verify the form's submit logic, error display, and navigation — not the Supabase Auth handshake itself. Real end-to-end sign-in is the J1 Playwright spec, deferred to T076 production deploy when a test user exists.

## Deviations from bundle (logged)

- **No Clerk `<SignIn>` catch-all** at `/sign-in/[[...rest]]`. Single `app/sign-in/page.tsx` with custom form.
- **No social sign-in** — bundle was vague on this; matches existing vanilla pattern (email + password only).
- **J1 Playwright spec deferred** — requires a real Supabase user; production deploy creates one. Component-level tests (7) carry the load until then.

## Verified

- `pnpm lint` → 0
- `pnpm typecheck` → 0
- `pnpm test` → 44/44 files, **165/165 tests** (7 new)
- `pnpm build` → `/sign-in` first-load 128 kB (budget 200 kB ✓); middleware 56.8 kB

## Done-when

- [x] `/sign-in` renders custom form using design-system primitives
- [x] Email + password sign-in via Supabase
- [x] Reset-password sub-flow
- [x] Sign-up disabled (admin invite only)
- [x] Error states display Supabase error messages verbatim
- [x] Component tests for happy + sad paths
- [N/A] Pixel diff vs `26_auth.png` ≤ 5% — deferred to T051 visual baselines
- [N/A] J1 Playwright spec — deferred to T076 (needs real user)
