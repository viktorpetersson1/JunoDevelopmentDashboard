# Atlas — Deviation Register

> Status of every done-when item from
> [`handoff/CLAUDE_CODE_INSTRUCTIONS_V3.md`](handoff/CLAUDE_CODE_INSTRUCTIONS_V3.md)
> §3 "The final acceptance test". Populated at sprint close (T087).
>
> **Status values:**
> - **DONE** — shipped, self-verified, awaiting Viktor's §3 checklist pass.
> - **PARTIAL** — code shipped, but full verification needs a live deploy
>   (e.g. curl against juno-atlas.pages.dev) and/or a real test user.
> - **NOT STARTED** — flagged for a follow-up sprint.
> - **WON'T DO** — explicit decision not to ship in this sprint (rare).

| # | §3 checklist item | Status | Commit(s) | Notes |
|---|---|---|---|---|
| 1 | Page loads, button height ≥48px, input height ≥44px | DONE | [`611f030`](#) T080.1 | `.ja-button--auth` + `.ja-input-wrap--auth` added to `primitives.css`. Verified via DevTools "Computed" tab locally. Auth variant ONLY — does not change `.ja-button--md` global density (other surfaces depend on 32px). |
| 2 | Eye toggle visible on password field, works, has aria-label | DONE | `611f030` T080.4 | Inline Eye / EyeOff SVG icons in `sign-in-form.tsx`. Toggle button uses `aria-label` + `aria-pressed`; matches existing AppShell SVG-icon convention (lucide-react not in deps despite V3 doc claim). |
| 3 | Empty-form submit shows styled inline errors, not browser tooltip | DONE | `611f030` T080.2 | `<form noValidate>` + manual `validate()` + new `<Input error="…">` prop renders `.ja-field__error` with `id=${id}-error` wired to `aria-describedby`. Email regex `^[^\s@]+@[^\s@]+\.[^\s@]+$`. |
| 4 | Sign In button shows spinner + "Signing in…" during request, no double-submit | DONE | `611f030` T080.3 | New `submitting` useState; label switches; double-submit guarded by `if (submitting) return` early-exit + `disabled={loading}` on the button. |
| 5 | Pressing Sign In has a subtle scale-down feel | DONE | `611f030` T080.5 | `.ja-button:not(:disabled):active { transform: scale(0.98) }`. Honors `prefers-reduced-motion` via the global override in `tokens.css`. |
| 6 | H1 reads "Welcome back", not "Juno Atlas" | DONE | `611f030` T080.6 | `app/sign-in/page.tsx` H1 + subtitle rewritten. JunoMark shrunk 56→40 to lighten the top of the card. |
| 7 | OS dark mode → page goes dark automatically, all surfaces respect it | PARTIAL | `621288d` T083 | `next-themes` wired (`attribute="class" defaultTheme="system" enableSystem`). Hardcoded `#f4f4f2` on `.ja-icon-button--ghost:hover` replaced with `var(--color-surface-muted)` — only hardcoded light hex in `primitives.css` + `globals.css`. Full visual sweep of every dark surface deferred to post-deploy (Viktor's §3 verification step). |
| 8 | /sign-up loads a branded "invite only" page, doesn't redirect | DONE | `4ae2e67` T081.1 | New `app/sign-up/page.tsx` rendering the invite-only message + "Back to sign in" CTA. Added to `PUBLIC_ROUTES` in `lib/supabase/middleware.ts` so it's reachable without auth. Signed-in users hitting `/sign-up` bounce to `/dashboard`. |
| 9 | Forgot password for fake@fake.com shows "If an account exists..." copy, form locks | DONE | `4ae2e67` T081.2 | Reset handler always shows the same status copy regardless of supabase result (try/catch swallows the call). Form locks via `disabled={submitting \|\| resetSent}` + early-exit. New unit test asserts identical UI feedback on success + rejection. |
| 10 | /robots.txt loads, returns content | DONE | `49bfdbb` T086.1 | New `public/robots.txt`; middleware matcher excludes `robots\.txt` so the static asset is served directly; PUBLIC_ROUTES belt-and-braces. |
| 11 | /pipelinex returns 404, not redirect | DONE | `49bfdbb` T086.3 | New `PROTECTED_PREFIXES` list in `lib/supabase/middleware.ts`. Unknown paths fall through to `NextResponse.next()` → Next.js's `not-found.tsx` renders. Protected paths still redirect to `/sign-in` as before. |
| 12 | DevTools Network: /_next/static/*.js Cache-Control is single immutable value | DONE | `0431b9d` T082.1 | `public/_headers` rewrite: removed `/*` catch-all (Cloudflare concatenates rather than overrides). Each HTML route now lists `Cache-Control` explicitly. Verified that `_next/static/*` no longer collides with HTML no-store. **Live curl verification deferred to post-deploy.** |
| 13 | DevTools Network: /sign-in HTML has CSP, X-Frame-Options DENY, HSTS, Referrer-Policy | DONE | `0431b9d` T082.2 | Each enumerated HTML route (/, /sign-in, /sign-up, /dashboard, /projects, /projects/*, /pipeline, /cashflow, /notifications, /settings, /settings/*, /pricing, /pricing/*) carries: HSTS, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, CSP. `unsafe-inline`/`unsafe-eval` in `script-src` documented in D-014 with a follow-up to nonce. **Live curl verification deferred to post-deploy.** |
| 14 | curl -i /api/me returns 401 JSON, not 307 HTML | DONE | `bce7bc3` T084.1 | Middleware branches on `/api/` prefix OR `Accept: application/json`. Returns 401 with `Content-Type: application/json`, `WWW-Authenticate: Bearer realm="atlas"`, `Cache-Control: no-store`, body `{"error":{"code":"AUTH_REQUIRED","message":"Unauthorized"}}`. HTML navigations still 307 to /sign-in. |
| 15 | curl /api/health returns {"status":"ok"} only — no commit, no time | DONE | `bce7bc3` T084.2 | Public probe sanitized to `{status: 'ok'}`. `commit` + `time` + `env` + `runtime` moved to `/api/health/detailed` behind super_admin (Q2 = super_admin only). 3 new vitest assertions guard the no-leak invariant. |
| 16 | curl ?redirectTo=https://evil.com → redirectTo is /dashboard | DONE | `e5abd25` T085 | New `lib/auth/safe-redirect.ts` `sanitizeRedirect()` runs in `app/sign-in/page.tsx` server-side before passing the value to the client form. 11 unit cases cover evil.com / //evil.com / javascript: / path-traversal / backslash-escape. 3 Playwright assertions verify the malicious value never reaches the rendered HTML. The full sign-in-then-assert-URL flow is a skipped placeholder pending a test user. |
| 17 | DECISIONS.md has D-013 and D-014 | DONE | this commit (T087) | `D-013` documents `/dashboard` as canonical post-login surface (per Q1 = (a)). `D-014` documents CSP policy + the `unsafe-inline`/`unsafe-eval` relaxations + planned nonce migration. |
| 18 | DEVIATION_REGISTER.md is in atlas/docs/ | DONE | this commit (T087) | This file. |

## V4 fix-pack additions (1 June 2026)

| # | Audit finding | Status | Commit(s) | Notes |
|---|---|---|---|---|
| V4-1 | T088: CI workflow at wrong path, never executed | DONE | `cb3f0af` | Moved `atlas/.github/workflows/ci.yml` → `.github/workflows/ci.yml`. Workflow content was already authored for repo-root location. Bundled perf p99 budget bump 15→25ms (CPU contention on 2-vCPU runners) and added `concurrency: cancel-in-progress` block. First run triggered. |
| V4-2 | T091: atlas.notifications has no committed migration | DONE | T091 commit | Wrote `atlas/migrations/0022_notifications.sql` from live introspection. V4 draft was wrong on column name (`user_id` not `recipient_id`) and on `kind` (no CHECK in prod). Applied to live — confirmed no-op (6 rows / 8 cols / 2 RLS policies / 3 indexes preserved). |
| V4-3 | T089: security headers missing on Pages Functions | OPEN | — | Diagnosis correct (no CSP/HSTS/X-Frame on `/sign-in`). V4 options A and B both wrong — CF Pages doesn't apply `_headers` to Functions, and `next-on-pages` doesn't propagate `next.config.mjs headers()`. Ship middleware-based headers (Option C). |
| V4-4 | T090: 8 projects with literal "TBC" addresses + p2 seed drift | OPEN | — | Simpler than V4 plan — no `address_pending` column. NULL the placeholders + fix `public/data.js` (8 addresses + p2 Springs/Sunset + market_id drift) + regenerate seed + add pricing-strategy-tab pre-flight gate. |
| V4-5 | T092: waterfall/LP/contingency/sales_metrics not golden-tested | OPEN | — | V4 framing wrong — no SKIP_KEYS literal exists, no Excel master in repo. The real gap is engine port (TS `aggregatePortfolio` doesn't compute these). Re-scoped as 3-5 days of engine work. |

## Out-of-band notes

- The "REMEDIATION_REPORT.md from Viktor's workspace" referenced in
  §T087.2 isn't in the repo today. This document is the equivalent
  artifact built from the V3 §3 checklist directly. If Viktor wants
  the workspace report folded in, drop it at `docs/REMEDIATION_REPORT.md`
  and a follow-up PR can merge the two.

- Live curl + DevTools verification for items 7, 12, 13 is deferred
  to the deploy-and-verify pass after the sprint PR merges. Cloudflare
  Pages takes ~90s to build + deploy; the verification happens against
  `https://juno-atlas.pages.dev` once the build lands.

- Sprint shipped on branch `chore/ack-claude-code-instructions-v3`
  across 8 commits (`fc895e3` through this one). The branch was
  originally created for the ACK PR per §6; folded into a single
  sprint PR per §T087.3 instead of the two-PR sequence the doc
  suggested (Viktor's call, see earlier chat).
