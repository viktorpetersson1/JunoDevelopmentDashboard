# T001 — Repo scaffold + tooling

**Goal:** Next.js 14 App Router app in `atlas/` subfolder of the existing JunoDevelopmentDashboard repo, with the tools pinned per `CLAUDE.md` §4 + `SUPABASE_TRANSLATION.md` §1.

## What changed

### New files in `atlas/`

- `package.json` — Next.js 14.2.18, React 18.3.1, TypeScript 5.6, Tailwind 3.4, Supabase SSR 0.5.2, Drizzle 0.36, Vitest 2.1, Playwright 1.49, Geist 1.3
- `tsconfig.json` — `strict: true`, `noUncheckedIndexedAccess: true`, `moduleResolution: bundler`
- `next.config.mjs` — minimal; `reactStrictMode: true`
- `.eslintrc.json` — `next/core-web-vitals` + `next/typescript` + `prettier`
- `.prettierrc.json` — incl. `prettier-plugin-tailwindcss`
- `tailwind.config.ts` — minimal (T003 wires tokens)
- `postcss.config.js` — Tailwind + autoprefixer
- `vitest.config.ts` — jsdom env, React plugin, path alias
- `playwright.config.ts` — Chromium 1440×900, dev server auto-start
- `.gitignore`, `.env.example`, `README.md`
- `app/layout.tsx` — Geist font, RootLayout, metadata
- `app/page.tsx` — minimal placeholder ("P0 scaffold")
- `app/globals.css` — Tailwind directives, token comment for T003
- `app/api/health/route.ts` — minimal `{ status: 'ok', commit, time }` (T011 hardens it)
- `lib/utils/log.ts` — replacement for `console.log` per CLAUDE.md §7
- `lib/utils/cn.ts` — `clsx + twMerge` helper for component composition
- `tests/setup.ts` — `@testing-library/jest-dom/vitest`
- `tests/smoke.test.ts` — sanity check
- `.github/workflows/ci.yml` — lint + typecheck + unit + build, paths-filtered to `atlas/**`

### Modified

- Root `.gitignore` updated to ignore `atlas/node_modules`, `atlas/.next`, `atlas/.env*`

## Deviations from bundle (logged)

- **No `pnpm-workspace.yaml`** — single package, no monorepo needed. Add if/when sidecar lands as separate package.
- **No `eslint.config.mjs`** — using legacy `.eslintrc.json` because `eslint-config-next` 14.x is not yet flat-config compatible.
- **`@/*` path alias targets `./*`** (Next.js convention), not `./src/*` — repo layout per CLAUDE.md §5 puts `app/`, `lib/`, `components/` at root, not under `src/`.
- **No Sentry yet** — added in T076 (production deploy).

## Done-when

- [x] `atlas/` directory exists with all scaffold files
- [ ] `pnpm install` clean (no peer warnings outside locked stack)
- [ ] `pnpm dev` boots on http://localhost:3000
- [ ] `pnpm lint` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` runs smoke test green
- [ ] `pnpm build` succeeds
- [ ] No deps installed that are not in `package.json`
- [x] `.env.example` lists every env var the codebase will read in P0
