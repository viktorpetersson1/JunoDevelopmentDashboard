# Cloudflare Pages deploy guide

Atlas runs on **Cloudflare Pages** with the `@cloudflare/next-on-pages`
adapter. All server-side routes use the **edge runtime** — every Server
Component, API handler, and page exports `export const runtime = 'edge'`.

The vanilla SPA at `public/` continues to live on **Render** under
`juno-dashboard.onrender.com`. Atlas is a separate deploy target.

---

## One-time setup (Cloudflare side)

You need a Cloudflare account. Free tier covers Atlas comfortably
(unlimited bandwidth, 500 builds/month, 100K requests/day on the free
Workers tier).

### 1. Create the Pages project

1. Cloudflare dashboard → **Workers & Pages** → **Create application** →
   **Pages** → **Connect to Git**
2. Authorise the GitHub app + pick `viktorpetersson1/JunoDevelopmentDashboard`
3. **Project name:** `juno-atlas`
4. **Production branch:** `main`
5. **Framework preset:** *Next.js*
6. **Root directory:** `atlas`
7. **Build command:** `pnpm install --frozen-lockfile && pnpm run pages:build`
8. **Build output directory:** `.vercel/output/static`
9. **Node version:** 20 (set via `NODE_VERSION=20` env var)

### 2. Set environment variables

In **Settings → Environment variables** add (for both Production and Preview):

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://mbehvcfiakjznzqkymse.supabase.co` | Public — used by browser client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *(from Supabase Dashboard → Project Settings → API)* | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | *(from same page, **secret**)* | **Encrypt** — never expose to client |
| `AUDIT_HASH_SALT` | *(generate: `openssl rand -hex 32`)* | **Encrypt** — IP hashing salt |
| `NODE_VERSION` | `20` | Pins build runtime |

Optional:
- `ATLAS_FEATURE_FLAGS` — comma-separated flag names
- `NEXT_PUBLIC_SENTRY_DSN` — wire later when Sentry lands

### 3. Set compatibility flags

In **Settings → Functions → Compatibility flags**:
- Production: `nodejs_compat`
- Preview: `nodejs_compat`

**⚠ This step is mandatory — `wrangler.toml` does NOT propagate the
flag to Pages Functions.** The `compatibility_flags` line in
`wrangler.toml` only applies to the newer "Workers + Static Assets"
runtime, but `@cloudflare/next-on-pages` deploys to the older "Pages
Functions" runtime. Without the dashboard flag, **every route returns
500** because the Node shims (Buffer, util, async_hooks) Supabase's
SSR client needs aren't available.

How to tell if you missed this: hit `/api/health` (zero-dependency
route). Should return JSON. If it 500s, the flag isn't applied yet.

After saving the flag, you must **re-trigger a deployment** — flag
changes don't apply to already-built functions:
- **Deployments tab → click the failed deploy → Retry deployment**, or
- push an empty commit: `git commit --allow-empty -m "redeploy" && git push`

### 3b. Expose the `atlas` schema in Supabase

By default Supabase's PostgREST only serves the `public` and
`graphql_public` schemas. Atlas reads from `atlas.*` tables, so the
schema must be added to the exposed list — otherwise every
authenticated page returns 500 with `PGRST106 "Invalid schema: atlas"`.

**Two ways to fix:**

- **SQL (already applied to mbehvcfiakjznzqkymse via migration
  `expose_atlas_schema_to_postgrest`):**
  ```sql
  ALTER ROLE authenticator SET pgrst.db_schemas TO 'public, atlas, graphql_public';
  NOTIFY pgrst, 'reload schema';
  ```
- **Dashboard:** Project Settings → API → "Exposed schemas" → add
  `atlas` → Save. PostgREST restarts automatically.

**Symptom if you skip this:** sign-in works (Supabase Auth uses
`/auth/v1/*`, not REST), but every authenticated page crashes after
sign-in with a Next.js production error page and a Digest hash.
Middleware survives because it only calls auth; pages crash because
they query atlas.* via REST.

**How to verify it's set:** with the anon key, hit
`https://<project>.supabase.co/rest/v1/projects?select=id&limit=1`
with header `Accept-Profile: atlas`. Expected: 200 with `[]` (RLS
returns no rows for anon) or 401 (no anon SELECT grant). Anything
mentioning PGRST106 means schema isn't exposed.

### 4. Custom domain (optional, deferred)

When ready, **Settings → Custom domains** → add `atlas.juno.dev` or
similar. DNS gets configured automatically if Cloudflare manages the
domain.

---

## Local development

```bash
# Standard Next.js dev — uses Node.js runtime locally even for edge routes.
pnpm dev

# Cloudflare-runtime preview — builds with next-on-pages then serves via
# wrangler. Closer to production; useful for catching edge-only issues.
pnpm run pages:build
pnpm run pages:dev
```

### Preflight checks (run before every build)

`pnpm run pages:build` automatically runs `scripts/preflight.mjs --remote`
first, which catches the deploy footguns we've actually hit:

1. **Required env vars present** — NEXT_PUBLIC_SUPABASE_URL,
   NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
   AUDIT_HASH_SALT
2. **NEXT_PUBLIC_SUPABASE_URL parses as a URL** — catches missing
   `https://`, surrounding quotes, trailing whitespace (the bug that
   500'd every route on the first CF deploy)
3. **JWT-shaped keys** — catches pasting publishable handle
   (sb_publishable_...) instead of the JWT
4. **Every server route exports `runtime = 'edge'`** — catches a
   missed file before `next-on-pages` fails post-build, saving ~3 min
   of wasted compile time
5. **Supabase REST exposes the `atlas` schema** — catches the
   PGRST106 "Invalid schema" bug that 500'd every authenticated page
6. **Cloudflare Pages has `nodejs_compat`** (opt-in, requires
   CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID env vars) — catches
   the flag-not-set bug that 500'd every dynamic route

Local-only checks (1-4) also run on every CI push via the `preflight`
GitHub Actions job — fail-fast before lint/test/build runs.

To run manually:
```bash
pnpm run preflight          # local checks only (no network)
pnpm run preflight:remote   # + Supabase + CF API checks (needs env)
```

### ⚠ Windows note — `pages:build` does NOT work natively on Windows

`@cloudflare/next-on-pages` invokes the Vercel CLI internally, which has
known reliability issues on Windows. Trying to run `pnpm run pages:build`
in PowerShell or cmd.exe fails with `SHELLAC COMMAND FAILED!`.

This is a Cloudflare/Vercel-side limitation. **It does not affect
production deploys** — Cloudflare's build pipeline runs on Linux, and
our CI's `pages-build` job runs on `ubuntu-latest`.

Local options for Windows users:
- **WSL (recommended):** `wsl --install`, clone the repo inside Ubuntu,
  run `pnpm run pages:build` there.
- **Skip local pages-build:** rely on CI + the Cloudflare preview URL
  (auto-generated per PR) to catch edge regressions.
- **`pnpm dev` works fine on Windows** for everything except validating
  Cloudflare-specific runtime behavior.

## Manual deploy (no GitHub Action)

```bash
pnpm run pages:deploy
# First time: wrangler will prompt for OAuth + project selection.
```

## CI auto-deploy

Cloudflare Pages GitHub integration triggers a build on every push to
`main` (production) and every PR (preview URL). No GitHub Action needed
in this repo unless we want custom behaviour.

---

## Edge runtime constraints

Atlas already complies with the constraints below — adding any new code
that violates them will fail at build time.

**Disallowed at runtime:**
- `fs` / `fs/promises` (no filesystem)
- `child_process` (no spawning)
- `cluster`, `worker_threads`
- Direct TCP / TLS sockets (use HTTP)
- `crypto.randomBytes` *(use `crypto.getRandomValues()` instead — Web Crypto)*

**Compatible (we use these):**
- `@supabase/ssr` + `@supabase/supabase-js` — HTTP only
- `next/headers` cookies/headers helpers
- Standard `fetch`, `URL`, `Request`, `Response`
- `crypto.subtle` for hashing (Web Crypto API)
- `Buffer` (via `nodejs_compat` flag)

**The drizzle client at `lib/db/client.ts` uses the `postgres` package
(TCP-based) and would NOT work at the edge.** It's only imported by
`drizzle-kit` migration scripts that run locally — not by any runtime
route. If we ever need direct DB queries at runtime, switch to:
- Supabase REST API (preferred — already in use)
- `@neondatabase/serverless` (HTTP-over-WebSocket, edge-compatible)
- Cloudflare Hyperdrive (Postgres proxy over HTTP)

---

## What's NOT yet on Cloudflare

- **Sentry** (`NEXT_PUBLIC_SENTRY_DSN`) — wire when T076 lands
- **Owner Supabase invites** — separate Supabase Admin API work
- **Custom domain** — deferred until production cutover is approved

---

## Troubleshooting

**Build fails with "Function exceeds size limit":** an edge function got
too big. Usually means a chart library got accidentally bundled into a
Server Component. Split into a client component (`'use client'`).

**Build fails with "X is not supported in Edge Runtime":** a Node API
crept in. Check the import chain — usually a transitive dep.

**Sign-in works locally but redirects loop on Cloudflare:** Supabase
cookies need `SameSite=Lax` and the host header must match. Verify the
`NEXT_PUBLIC_SUPABASE_URL` env var doesn't have a trailing slash.

**API routes return 500 with no useful error:** check
`Cloudflare Dashboard → Pages → juno-atlas → Functions → Real-time
logs`. Server errors stream there with stack traces.

---

## Why Cloudflare (vs Render web_service)

| | Cloudflare Pages | Render web_service |
|---|---|---|
| Cost | Free tier covers Atlas | $7/mo starter |
| Latency | Global edge (~30ms TTFB worldwide) | Single region (Oregon) |
| Build | Native Next.js via adapter | Native Next.js direct |
| Preview URLs | Auto per-PR | Paid plan only |
| DDoS protection | Built in | Manual |
| Cold starts | Minimal (edge-isolated) | Up to 30s on free tier |
| MCP for setup | None — wrangler CLI / dashboard | Render MCP |

The runtime constraints are real but Atlas was already edge-compatible
(all data access via Supabase HTTP client). Net win on cost,
performance, and DX. Render keeps hosting the legacy vanilla SPA at
`public/` independently.
