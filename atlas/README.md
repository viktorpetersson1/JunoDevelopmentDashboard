# Juno Atlas

Operating dashboard for KP Confidencia / Juno villa development. P0 scaffold.

## Stack

- Next.js 14 App Router · TypeScript strict · Tailwind v3
- Supabase (Auth + Postgres) · Drizzle ORM
- Vitest · Playwright · Recharts · lucide-react · Geist font

Full contract: `../docs/handoff/CLAUDE.md` + `../docs/handoff/SUPABASE_TRANSLATION.md`.

## Quick start

```powershell
cd C:\Dev\juno-financial-dashboard\atlas
pnpm install
cp .env.example .env.local  # fill in Supabase keys
pnpm dev
```

Open http://localhost:3000.

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Dev server on :3000 |
| `pnpm build` | Production build |
| `pnpm start` | Run production build |
| `pnpm lint` | ESLint (next/core-web-vitals) |
| `pnpm typecheck` | `tsc --noEmit` strict |
| `pnpm test` | Vitest unit tests |
| `pnpm test:e2e` | Playwright E2E |
| `pnpm format` | Prettier write |
| `pnpm db:generate` | Drizzle migration generate |
| `pnpm db:push` | Drizzle migration apply |
| `pnpm db:studio` | Drizzle visual studio |

## Layout

See `../docs/handoff/CLAUDE.md` §5 for the authoritative layout, with Supabase deltas in `../docs/handoff/SUPABASE_TRANSLATION.md`.

## Tickets

`tickets/P0/T<nnn>-<slug>.md` — one per ticket. Source spec: `../docs/handoff/P0_TICKETS.md`.
