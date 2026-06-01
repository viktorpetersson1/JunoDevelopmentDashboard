# Juno Atlas — Sign-In Polish + Security Hardening Sprint (v3)

**Owner:** Viktor Petersson (KP Confidencia / Juno)
**Date:** 26 May 2026, 12:39 +04
**Supersedes:** the morning-of-26-May ticket pack (T080–T084) which was not picked up. All those tickets are folded into this file and re-issued.
**Status:** **PAUSE all new feature work** until every ticket in this file is shipped, verified, and signed off.

---

## 1. Why this file exists

The Exit Pricing v1 feature you shipped today (commits `682dae2` → `78c476c`) is real, substantial work. But four independent reviewers re-audited https://juno-atlas.pages.dev/ four hours after the morning audit and **the sign-in surface was byte-identical** — same Build ID, same 12 polish issues, three new ones discovered. The sign-in surface is the only page anyone outside Viktor's team can see. As of 12:00 +04 it scores 6.0/10 against Ramp, down from 6.3 this morning (dark mode was confirmed dead code).

**Ground rules for this sprint:**

1. Do **NOT** open any new feature ticket until every ticket here is closed.
2. Each ticket has a **done-when** checklist. Self-grade against it before opening a PR.
3. PR descriptions must include a screenshot or curl-evidence block for every done-when item.
4. Definition of done = Viktor reloads `https://juno-atlas.pages.dev/`, opens DevTools, and personally verifies the measurable items below pass.

**Two safety rules carried over (do not violate):**

- Default to read-only. Never delete, move, rename, or modify any file unrelated to the tickets below.
- Do not send any email, message, or external communication. Drafts only.

---

## 2. The tickets

Eight tickets, all P0 or P1, totalling roughly 1.5 days of focused work. Ordered for dependency: do them top-to-bottom; do not parallelize.

### T080 — Sign-in surface polish (P0, ~6 pomos)

The full visual remediation. Touch only `atlas/app/sign-in/sign-in-form.tsx`, `atlas/components/ui/primitives.css`, `atlas/components/ui/Input.tsx`, `atlas/components/ui/Button.tsx`, `atlas/app/tokens.css`.

**T080.1 — Auth-size button + input variants**

Today `.ja-button--md` and `.ja-input-wrap` are both `height: 32px`. That fails WCAG 2.5.5 (44px touch min) and reads as a dense app control, not a primary CTA. Do **not** change `--md` globally — other surfaces depend on 32px density. Add a new auth variant.

In `atlas/components/ui/primitives.css`:

```css
.ja-button--auth {
  height: 48px;
  font-size: var(--font-size-base); /* 14-15px */
  font-weight: 500;
  border-radius: 8px;
  width: 100%;
}

.ja-input-wrap--auth {
  height: 44px;
}

.ja-input-wrap--auth .ja-input {
  font-size: 16px; /* MUST be >=16px — iOS Safari auto-zooms below this */
  padding-inline: 14px;
}

.ja-field__label--auth {
  font-size: var(--font-size-sm); /* bump from 12 to 13 */
  font-weight: 500;
}
```

In `sign-in-form.tsx`, apply `--auth` to the Sign In button and both inputs.

**Done-when:**

- DevTools "Computed" tab on the Sign In button shows `height: 48px`
- Both inputs show `height: 44px` and `font-size: 16px`
- On iPhone Safari (or DevTools iPhone emulation), tapping the email field does not zoom

**T080.2 — Custom inline validation**

Today the form fires browser-native validation tooltips ("Please fill out this field"). Replace with styled inline errors using the existing `.ja-input-wrap--invalid` class.

In `sign-in-form.tsx`:

- Add `noValidate` to the `<form>` element.
- On submit, validate manually. If empty: add `--invalid` class to the wrap and render a `.ja-field__error` element with `id="email-error"` (or `password-error`).
- Pass `aria-invalid={hasError}` and `aria-describedby="email-error"` to the input when invalid.

Add CSS if missing:

```css
.ja-field__error {
  margin-top: 6px;
  font-size: var(--font-size-xs);
  color: var(--color-text-negative); /* or #b91c1c */
  line-height: 1.4;
}
```

**Done-when:**

- Submitting an empty form shows two custom red error messages, no browser tooltip
- Submitting a malformed email shows "Enter a valid email address" below the email field
- Inputs gain `aria-invalid="true"` and `aria-describedby` linked to the error element
- A screen reader (test with VoiceOver or NVDA) announces the error when focus enters the invalid field

**T080.3 — Submit loading state**

Today `aria-busy` is wired statically. The `.ja-button--loading` and `.ja-button__spinner` CSS exists but is never activated. There is no double-submit prevention.

In `sign-in-form.tsx`:

- Add `const [submitting, setSubmitting] = useState(false)`
- On submit, set true; in `finally`, set false
- Button gets `className={cn("ja-button ja-button--primary ja-button--auth", submitting && "ja-button--loading")}`
- Button label switches to "Signing in…" when submitting
- Set `aria-busy={submitting}` and `disabled={submitting}`

**Done-when:**

- Click Sign In with any credentials → button shows spinner + text changes + is disabled until the response resolves
- Double-clicking does not fire two auth requests (verify in Network tab)

**T080.4 — Password show/hide toggle**

The `.ja-input-affix--icon` infrastructure already exists. Use it.

In `sign-in-form.tsx`, wrap the password input:

```tsx
<div className="ja-input-wrap ja-input-wrap--auth">
  <input
    type={showPassword ? "text" : "password"}
    className="ja-input"
    ...
  />
  <button
    type="button"
    className="ja-input-affix ja-input-affix--icon"
    aria-label={showPassword ? "Hide password" : "Show password"}
    aria-pressed={showPassword}
    onClick={() => setShowPassword(s => !s)}
  >
    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
  </button>
</div>
```

Use `lucide-react` (already in dependencies) for the icons.

**Done-when:**

- Eye icon visible on the right of the password field
- Click toggles between hidden and visible password
- `aria-label` updates with state
- Keyboard-only: Tab order is `email → password → eye toggle → Sign In → Forgot password?`

**T080.5 — Press micro-interaction**

Ramp has a subtle physical-press feel. One line of CSS closes most of that gap.

In `primitives.css`, append to the `.ja-button--primary:active` rule:

```css
.ja-button:not(:disabled):active {
  transform: scale(0.98);
  transition:
    transform 80ms ease,
    background-color 120ms ease;
}
```

**Done-when:**

- Pressing and holding the Sign In button visibly compresses it
- The transition feels smooth on a mid-range laptop (60fps)

**T080.6 — Heading + subtitle copy**

The current pattern is: 56px Juno mark above an `<h1>` reading "Juno Atlas" above a subtitle "Sign in to continue." That's brand-redundant (the mark already says "Juno") and the subtitle is filler.

In `sign-in-form.tsx`:

- Keep the Juno mark
- Change `<h1>` text to **"Welcome back"**
- Change subtitle to **"Sign in to your Juno Atlas workspace."**

Optionally reduce mark size from 56px → 40px to lighten the top of the card.

**Done-when:**

- The H1 reads "Welcome back"
- Subtitle is the new copy
- Visual hierarchy on a 1440px viewport feels less top-heavy

**T080.7 — Tertiary text + border contrast**

In `atlas/app/tokens.css`:

```css
:root {
  --color-text-tertiary: #767b84; /* was #8a8f98 — now 4.52:1 on white */
  --color-border-hairline: #c8c8c5; /* was #efefec — now 3.1:1 on white */
}
```

Verify the new values still look right in dark mode — the `.dark` overrides may need a matching tweak (`--color-text-tertiary` in dark stays at `#8a8f98` against `#0d0d0d` for 5.98:1, which is fine).

**Done-when:**

- Pasting the page into the WebAIM contrast checker (or DevTools "Contrast" indicator), "Need an account?" passes 4.5:1
- Input resting border passes 3:1 against the card background
- Spot-check dark mode: contrast still passes

**T080.8 — Forgot-password button hygiene**

Today the "Forgot password?" link uses raw Tailwind classes and is full-width — visually competes with the primary CTA.

Replace with a properly-styled ghost button at smaller width, separated from the primary by 24-32px:

```tsx
<div className="mt-6 text-center">
  <button
    type="button"
    onClick={() => setMode('reset')}
    className="ja-button ja-button--ghost ja-button--sm"
  >
    Forgot password?
  </button>
</div>
```

If `.ja-button--sm` doesn't exist, add it: `height: 32px; padding: 0 12px; font-size: var(--font-size-sm);`

**Done-when:**

- "Forgot password?" is no longer full-width
- It uses the `.ja-button` system, so it gets hover transition, focus ring, and active state for free
- Gap between Sign In and Forgot password is `var(--space-6)` or larger

---

### T081 — Sign-up route + Forgot-password copy (P0, ~3 pomos)

**T081.1 — Build a real `/sign-up` page**

Today `/sign-up` silently 307s to `/sign-in` with no explanation. If invite-only is the model, render an actual page explaining that.

Create `atlas/app/sign-up/page.tsx`:

```tsx
import Link from 'next/link';
import { JunoMark } from '@/components/brand/JunoMark';

export const metadata = { title: 'Sign up — Juno Atlas' };

export default function SignUpPage() {
  return (
    <div className="ja-auth-shell">
      <div className="ja-auth-card">
        <JunoMark size={40} />
        <h1>Invite only</h1>
        <p>
          Juno Atlas is currently available to Juno owners and admins only. To request access,
          contact your Juno administrator.
        </p>
        <Link href="/sign-in" className="ja-button ja-button--primary ja-button--auth">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
```

Remove any middleware logic that redirects `/sign-up` → `/sign-in`. The page should be reachable directly.

**Done-when:**

- `curl -I https://juno-atlas.pages.dev/sign-up` returns `200`, not `307`
- The page renders with the same design system as `/sign-in`
- "Back to sign in" returns to the sign-in screen

**T081.2 — Fix forgot-password email enumeration**

Today: submit any email (registered or not) → "Reset link sent. Check your email." That confirms account existence to attackers (OWASP info disclosure).

In the reset flow handler:

- Always show the same success message regardless of whether `resetPasswordForEmail` succeeded or failed
- Wrap the Supabase call in try/catch; do not surface errors to the UI
- New success copy: **"If an account exists for that email, we've sent a reset link."**

Also: after first submission, disable the email input + button. Show a "Send again in 60s" countdown if you want to allow retries; otherwise lock the form until page reload.

**Done-when:**

- Submitting `fake@fake.com` and `viktor.petersson@kpconfidencia.com` produce identical UI feedback
- The form locks after submission
- No timing-attack signal: both paths take similar wall time (the request still goes through; only the UI is normalized)

**T081.3 — Root redirect target**

Today `GET /` → `/sign-in?redirectTo=%2F` which post-auth lands on `/` again. That's a no-op redirect cycle.

In middleware or the root page server component:

- If unauthenticated, redirect to `/sign-in?redirectTo=/dashboard` (or `/projects` — pick the canonical post-login surface and document it in `atlas/docs/DECISIONS.md` as D-013)
- If `redirectTo` is missing entirely, default to `/dashboard`

**Done-when:**

- `curl -I https://juno-atlas.pages.dev/` returns `307` with `location: /sign-in?redirectTo=/dashboard` (or the canonical surface)
- A successful sign-in from the root URL lands on the dashboard, not back at `/`

---

### T082 — Security + caching headers (P0, ~2 pomos)

**T082.1 — Fix the Cache-Control concatenation bug**

This is the critical perf bug. `atlas/public/_headers` has:

```
/_next/static/*
  Cache-Control: public, max-age=31536000, immutable

/*
  Cache-Control: no-store, must-revalidate
```

Cloudflare Pages applies **both** matching rules and concatenates their headers, producing the broken `public, max-age=31536000, immutable, no-store, must-revalidate` we observe on every static asset. The `_headers` spec says more-specific rules should win, but the live deployment proves otherwise.

Fix options (pick one):

**Option A (preferred)** — re-order with explicit exclusions:

```
# Specific rules first
/_next/static/*
  Cache-Control: public, max-age=31536000, immutable
  X-Content-Type-Options: nosniff

/__next-on-pages-dist__/*
  Cache-Control: public, max-age=31536000, immutable
  X-Content-Type-Options: nosniff

/icon.svg
  Cache-Control: public, max-age=3600, must-revalidate

/api/*
  Cache-Control: no-store, must-revalidate

# HTML catch-all — but explicitly skip static via more-specific rules above
/sign-in
  Cache-Control: no-store, must-revalidate

/sign-up
  Cache-Control: no-store, must-revalidate

# Note: do NOT include a /* catch-all — Cloudflare concatenates instead of overriding.
# Every HTML route that needs no-cache gets listed explicitly.
```

**Option B** — move the headers config into `next.config.mjs`'s `headers()` function instead of `_headers`. That gives true rule-override semantics. Reference: https://nextjs.org/docs/app/api-reference/next-config-js/headers

Verify the fix with:

```bash
curl -I https://juno-atlas.pages.dev/_next/static/chunks/webpack-862c97fc18decd20.js | grep -i cache-control
# Expect ONE clean header, no comma-concatenated no-store
```

**Done-when:**

- `Cache-Control` on any `/_next/static/**` asset is exactly `public, max-age=31536000, immutable` — no `no-store`, no `must-revalidate`
- `Cache-Control` on `/sign-in` HTML is exactly `no-store, must-revalidate`
- DevTools Network panel shows static assets as `(disk cache)` on second page load

**T082.2 — Add security headers to HTML responses**

Today the HTML response has zero security headers. Add them via `_headers` (or `next.config.mjs`):

```
/sign-in
  Cache-Control: no-store, must-revalidate
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

Apply the same block to `/sign-up`, `/dashboard`, `/projects/*`, `/pipeline`, `/cashflow`, `/notifications`, `/settings`, `/pricing/*`.

Tighten CSP after initial deploy: remove `unsafe-inline` / `unsafe-eval` from `script-src` by adopting Next.js nonces (requires `experimental.cspNonce` or a custom middleware). That's a follow-up — for now `unsafe-inline` is acceptable to ship.

**Done-when:**

- `curl -I https://juno-atlas.pages.dev/sign-in` shows all 6 headers above
- Browser console shows no CSP violation reports during normal sign-in flow
- Embedding `https://juno-atlas.pages.dev/sign-in` in an `<iframe>` is blocked (test with a quick local HTML file)

**T082.3 — Preconnect to Supabase**

In `atlas/app/layout.tsx` (or wherever the `<head>` is composed), add:

```tsx
<link rel="preconnect" href="https://mbehvcfiakjznzqkymse.supabase.co" crossOrigin="" />
<link rel="dns-prefetch" href="https://mbehvcfiakjznzqkymse.supabase.co" />
```

Better: load the Supabase URL from an env var and template it in.

**Done-when:**

- DevTools Network → first auth call shows the TLS handshake completing before the form is submittable, not after submit
- Lighthouse audit no longer flags "Preconnect to required origins"

---

### T083 — Dark mode auto-detect (P1, ~2 pomos)

Today `.dark` token overrides are defined in `atlas/app/tokens.css` (line 248+) but no `@media (prefers-color-scheme: dark)` query exists anywhere. OS dark mode users see the same white screen.

**T083.1 — System theme detection**

Add `next-themes` (small, no breaking changes):

```bash
pnpm add next-themes
```

In `atlas/app/layout.tsx`:

```tsx
import { ThemeProvider } from 'next-themes';

<html lang="en" suppressHydrationWarning>
  <body>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </ThemeProvider>
  </body>
</html>;
```

`next-themes` toggles a `class="dark"` on `<html>` when the system is dark, which activates the existing `.dark` CSS block. No new tokens needed.

**T083.2 — Fix the ghost-icon-button hover bug**

In `primitives.css`:

```css
/* WAS */
.ja-icon-button--ghost:hover:not(:disabled) {
  background: #f4f4f2;
}

/* CHANGE TO */
.ja-icon-button--ghost:hover:not(:disabled) {
  background: var(--color-surface-muted);
}
```

**T083.3 — Verify every dark token resolves correctly**

Walk every screen reachable from sign-in (sign-in, forgot-password, sign-up). For each:

1. Set DevTools "Emulate CSS media feature prefers-color-scheme: dark"
2. Confirm background, text, borders, button, focus ring all use dark tokens
3. Take a screenshot for the PR

**Done-when:**

- macOS / Windows in dark mode opens the site dark; in light mode opens light
- Manually toggling OS theme without reloading the page updates the UI in real time
- No hardcoded light colors leak through (search `#fff`, `#ffffff`, `#f4f4f2`, `#fafaf8` in `primitives.css` and `globals.css` — any non-token use is a bug)

---

### T084 — API auth response format (P0, ~2 pomos)

Today `/api/me`, `/api/comps`, `/api/notifications`, and every other API route returns `HTTP/2 307` with `location: /sign-in` to unauthenticated requests. That breaks every API consumer — curl, mobile apps, partner integrations, automation scripts.

**T084.1 — Branch on Accept / path in middleware**

In `atlas/middleware.ts`, when auth fails:

```ts
const isApi = request.nextUrl.pathname.startsWith('/api/');
const wantsJson = request.headers.get('accept')?.includes('application/json');

if (isApi || wantsJson) {
  return NextResponse.json(
    { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } }
  );
}

// Existing page-route behavior:
return NextResponse.redirect(new URL(`/sign-in?redirectTo=${pathname}`, request.url));
```

**T084.2 — Sanitize `/api/health` public response**

Today: `{"data":{"status":"ok","commit":"dev","time":"..."}}` — leaks `commit` and `time` to any unauthenticated curl.

Change the public path to return only `{"status":"ok"}`. Move detailed status (commit SHA, build time, env) behind auth at `/api/health/detailed`. The healthcheck consumer (Cloudflare uptime, internal monitor) can hit `/api/health/detailed` with the service role or an admin session.

**Done-when:**

- `curl -i https://juno-atlas.pages.dev/api/me` returns `401` with JSON body, not 307 HTML
- `curl -i https://juno-atlas.pages.dev/api/health` returns `{"status":"ok"}` only — no commit, no time
- A logged-in browser session still works for all API routes
- Page navigation to `/projects/abc` while logged-out still redirects to `/sign-in` (HTML routes preserve 307 behavior)

---

### T085 — Open-redirect hardening (P0, ~1 pomo)

Today `?redirectTo=https://evil.com` is embedded raw into the RSC payload. If `router.push(redirectTo)` is called post-login without validation, that's a phishing vector.

**T085.1 — Server-side allowlist**

Create `atlas/lib/auth/safe-redirect.ts`:

```ts
export function sanitizeRedirect(input: string | undefined | null): string {
  const fallback = '/dashboard'; // align with T081.3
  if (!input) return fallback;

  // Must start with single slash
  if (!input.startsWith('/')) return fallback;
  // Reject protocol-relative URLs
  if (input.startsWith('//')) return fallback;
  // Reject \-escape tricks some browsers normalize
  if (input.includes('\\')) return fallback;
  // Strip query and hash for the redirect check (still pass them through)
  const path = input.split('?')[0].split('#')[0];
  // Allowlist of known top-level segments (defense in depth)
  const allowed = [
    '/dashboard',
    '/projects',
    '/pipeline',
    '/cashflow',
    '/notifications',
    '/settings',
    '/pricing',
  ];
  if (allowed.some((p) => path === p || path.startsWith(p + '/'))) return input;
  return fallback;
}
```

Wire it everywhere `redirectTo` is consumed: `atlas/app/sign-in/page.tsx`, the sign-in form action, and any client-side `router.push` call that takes `searchParams.redirectTo`.

**T085.2 — Test**

In `atlas/app/sign-in/__tests__/sign-in-form.test.tsx` (or a new file), add Vitest cases:

```ts
expect(sanitizeRedirect('https://evil.com')).toBe('/dashboard');
expect(sanitizeRedirect('//evil.com')).toBe('/dashboard');
expect(sanitizeRedirect('javascript:alert(1)')).toBe('/dashboard');
expect(sanitizeRedirect('/projects/abc')).toBe('/projects/abc');
expect(sanitizeRedirect('/projects/abc?tab=capital')).toBe('/projects/abc?tab=capital');
expect(sanitizeRedirect(undefined)).toBe('/dashboard');
expect(sanitizeRedirect('')).toBe('/dashboard');
expect(sanitizeRedirect('/../etc/passwd')).toBe('/dashboard');
```

Add a Playwright spec: sign in with `?redirectTo=https://evil.com` and assert the post-auth URL is `/dashboard`, not `evil.com`.

**Done-when:**

- All 8 unit cases pass
- Playwright assertion passes in CI
- `curl -s "https://juno-atlas.pages.dev/sign-in?redirectTo=https://evil.com" | grep redirectTo` shows the value as `/dashboard`, not `https://evil.com`

---

### T086 — robots.txt + iOS input zoom + 404 (P1, ~2 pomos)

**T086.1 — Public robots.txt**

Create `atlas/public/robots.txt`:

```
User-agent: *
Disallow: /api/
Disallow: /sign-in
Disallow: /sign-up
Allow: /

Sitemap: https://juno-atlas.pages.dev/sitemap.xml
```

In `atlas/middleware.ts`, the auth gate must skip `/robots.txt`, `/sitemap.xml`, `/favicon.ico`, `/icon.svg`, and `/_next/static/*`. If the matcher already excludes these via Next.js conventions (it should), verify.

Optionally add a basic `app/sitemap.ts` that lists only public routes (`/sign-in`, `/sign-up`).

**Done-when:**

- `curl https://juno-atlas.pages.dev/robots.txt` returns the file, not a 307
- `curl https://juno-atlas.pages.dev/sitemap.xml` returns valid sitemap XML (if implemented) or a 404 (acceptable)

**T086.2 — iOS input font-size**

Already covered in T080.1 (font-size: 16px on auth inputs). Double-check this lands.

**T086.3 — 404 for unknown unauthenticated routes**

Today `/pipelinex` returns 307 to sign-in. Should return 404.

In middleware: before the auth check, run a route-existence check. If the path doesn't match any known route prefix (`/sign-in`, `/sign-up`, `/dashboard`, `/projects`, `/pipeline`, `/cashflow`, `/notifications`, `/settings`, `/pricing`, `/api`, static prefixes), let Next.js handle it (which yields 404).

Or simpler: redirect to `/sign-in` only if the path _does_ match a known protected prefix. Everything else falls through to Next.js's `not-found.tsx`.

**Done-when:**

- `curl -I https://juno-atlas.pages.dev/pipelinex` returns 404
- `curl -I https://juno-atlas.pages.dev/projects/anything` still returns 307 (auth-protected)
- Visiting `/pipelinex` in a browser shows the branded 404 page

---

### T087 — Update deviation register + sprint sign-off (P0, ~0.5 pomo)

After all the above ships:

1. Update `atlas/docs/DECISIONS.md`:

   - Add **D-013** documenting the canonical post-login surface (`/dashboard` or whichever).
   - Add **D-014** documenting the CSP policy and known relaxations (`unsafe-inline` for now, plan to nonce in next sprint).

2. Move `REMEDIATION_REPORT.md` from Viktor's workspace into the repo as `atlas/docs/DEVIATION_REGISTER.md`. For each line: status (DONE / PARTIAL / NOT STARTED / WON'T DO), commit ref(s), reason.

3. Open a single PR titled **"Sprint: sign-in polish + security hardening (T080–T087)"** that contains _all_ the above commits squashed or grouped, with a checklist in the description matching the done-when items in this file.

**Done-when:**

- DEVIATION_REGISTER.md is in the repo
- DECISIONS.md has the two new D-entries
- PR description ticks every done-when checkbox from this document
- CI is green (unit + golden + Playwright)
- Viktor reloads the live URL and personally confirms button height, password toggle, dark mode auto-detect, and that he can curl `/api/me` to get a 401 JSON

---

## 3. The final acceptance test (Viktor's checklist)

When the PR is ready for review, Viktor will perform this checklist on `https://juno-atlas.pages.dev/`:

```
[ ] Page loads, button height ≥48px, input height ≥44px
[ ] Eye toggle visible on password field, works, has aria-label
[ ] Empty-form submit shows styled inline errors, not browser tooltip
[ ] Sign In button shows spinner + "Signing in…" during request, doesn't double-submit
[ ] Pressing Sign In has a subtle scale-down feel
[ ] H1 reads "Welcome back", not "Juno Atlas"
[ ] OS dark mode → page goes dark automatically, all surfaces respect it
[ ] /sign-up loads a branded "invite only" page, doesn't redirect
[ ] Forgot password for fake@fake.com shows "If an account exists..." copy, form locks
[ ] /robots.txt loads, returns content
[ ] /pipelinex returns 404, not redirect
[ ] DevTools Network: /_next/static/*.js Cache-Control is "public, max-age=31536000, immutable" (single value)
[ ] DevTools Network: /sign-in HTML has CSP, X-Frame-Options DENY, HSTS, Referrer-Policy
[ ] curl -i /api/me returns 401 JSON, not 307 HTML
[ ] curl /api/health returns {"status":"ok"} only — no commit, no time
[ ] curl ?redirectTo=https://evil.com → sign-in page shows redirectTo as /dashboard, not evil.com
[ ] DECISIONS.md has D-013 and D-014
[ ] DEVIATION_REGISTER.md is in atlas/docs/
```

Every item must check before merge. If any single item fails, the PR is blocked.

---

## 4. Estimated effort summary

| Ticket                                | Pomos                               | Priority |
| ------------------------------------- | ----------------------------------- | -------- |
| T080 — sign-in polish (8 subtasks)    | 6                                   | P0       |
| T081 — sign-up route + forgot-pw copy | 3                                   | P0       |
| T082 — security + cache headers       | 2                                   | P0       |
| T083 — dark mode auto-detect          | 2                                   | P1       |
| T084 — API auth response format       | 2                                   | P0       |
| T085 — open-redirect hardening        | 1                                   | P0       |
| T086 — robots.txt + iOS zoom + 404    | 2                                   | P1       |
| T087 — deviation register + PR        | 0.5                                 | P0       |
| **Total**                             | **~18.5 pomos (≈1.5 days focused)** |          |

## 5. Where to find things

| Need                         | Path                                                      |
| ---------------------------- | --------------------------------------------------------- |
| Sign-in form                 | `atlas/app/sign-in/sign-in-form.tsx`                      |
| Sign-in page (server)        | `atlas/app/sign-in/page.tsx`                              |
| Auth middleware              | `atlas/middleware.ts`, `atlas/lib/supabase/middleware.ts` |
| Design tokens (light + dark) | `atlas/app/tokens.css`                                    |
| Component primitives CSS     | `atlas/components/ui/primitives.css`                      |
| Input component              | `atlas/components/ui/Input.tsx`                           |
| Button component             | `atlas/components/ui/Button.tsx`                          |
| Root layout                  | `atlas/app/layout.tsx`                                    |
| Headers config               | `atlas/public/_headers`                                   |
| Wrangler config              | `atlas/wrangler.toml`                                     |
| Decisions log                | `atlas/docs/DECISIONS.md`                                 |

---

## 6. First action

Read this document end to end. Then open a small PR titled **"chore: ACK CLAUDE_CODE_INSTRUCTIONS_V3"** that adds this file to `atlas/docs/handoff/CLAUDE_CODE_INSTRUCTIONS_V3.md` plus an `ACK.md` containing:

```
T080-v3 ACK: I have read CLAUDE_CODE_INSTRUCTIONS_V3.md.
I will not open any new feature ticket until T080–T087 are shipped,
verified against Viktor's checklist in section 3, and merged.
I will not violate the safety rules in section 1.

Signed: Claude Code (instance + date)
```

Wait for Viktor to merge that ACK PR. Then start T080.1.

---

## 7. Questions

If anything in this file is ambiguous, ask Viktor before coding. Do not assume. This document is the contract.
