# API_CONTRACTS.md — Juno Atlas REST API

**Owner:** Viktor Petersson · **Version:** 1.0 (P0 + P1 scope) · **Last update:** 20 May 2026

This document is the single source of truth for every HTTP endpoint Claude Code is allowed to build in P0 and P1. **Do not add endpoints outside this list without a logged ADR** (see `DECISIONS.md`). If a new endpoint is needed, stop and ask.

---

## 0. Conventions

### 0.1 Base & versioning

- Base URL: `/api`
- No URL versioning year 1. Breaking changes require an ADR + migration plan.
- Internal Python sidecar (FastAPI): `/sidecar/...` — never exposed publicly; called server-to-server only.

### 0.2 Auth

- All `/api/*` routes require Clerk session cookie (`__session`).
- Public routes are explicitly marked `🌐 PUBLIC` (only `/api/health` and P3 villa snapshot endpoints).
- Role enforcement in route handler via `requireRole(['admin'])` middleware. See `lib/auth/roles.ts`.

### 0.3 Request/response

- Content-Type: `application/json` (except file uploads → `multipart/form-data`)
- All request bodies validated with Zod schemas in `lib/schemas/`
- All response bodies typed via `lib/types/api.ts`
- Money: integer cents (`bigint` serialised as string in JSON, e.g. `"125000000"` = $1,250,000.00)
- Dates: ISO 8601 UTC (`"2026-05-20T18:08:00.000Z"`)
- Percentages: decimal (`0.25` = 25%)

### 0.4 Error envelope

Every non-2xx response:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable summary",
    "details": { "field": "startDate", "issue": "must be ISO 8601" },
    "traceId": "req_01HXYZ..."
  }
}
```

Error codes (extend in `lib/errors.ts`, never invent at the route level):

| Code | HTTP | When |
|---|---|---|
| `UNAUTHENTICATED` | 401 | No Clerk session |
| `FORBIDDEN` | 403 | Authenticated but role insufficient |
| `NOT_FOUND` | 404 | Resource doesn't exist or user has no access |
| `VALIDATION_ERROR` | 400 | Zod failed |
| `CONFLICT` | 409 | Approval-snapshot rule, idempotency clash, optimistic-lock |
| `RATE_LIMITED` | 429 | Inngest/AI route guards |
| `CALC_FAILED` | 422 | Computation engine refused inputs (e.g. start date in 1899) |
| `INTERNAL` | 500 | Unhandled — must hit Sentry |

### 0.5 Idempotency

Any state-mutating POST that could be retried (capital call create, pricing run trigger) accepts header `Idempotency-Key: <client-uuid>`. Server stores the response keyed on `(userId, route, idempotencyKey)` for 24h.

### 0.6 Pagination

Cursor-based, never offset.

```
GET /api/projects?limit=20&cursor=eyJpZCI6...
→ { items: [...], nextCursor: "eyJpZCI6..." | null }
```

Defaults: `limit=20`, max `100`.

### 0.7 Audit

Every mutating endpoint MUST insert a row into `audit_log` via `lib/services/audit.ts` (table defined in schema W0.3). The audit-log middleware in `app/api/_middleware.ts` does this automatically — do not write to `audit_log` directly from route handlers.

---

## 1. Endpoint map — P0 (Foundation, 4 weeks)

The P0 cut is the minimum needed to render the 34 surfaces with read-only Excel-imported data plus capital-call CRUD.

### 1.1 Health & meta

| Method | Path | Role | Done by |
|---|---|---|---|
| GET | `/api/health` 🌐 PUBLIC | – | W0.1 |
| GET | `/api/me` | any | W0.2 |
| GET | `/api/config` | any | W0.2 |

**`GET /api/me`** → `{ user: User, orgs: Org[], activeOrgId: string, role: 'admin'|'owner'|'viewer' }`

**`GET /api/config`** → feature flags + env-derived constants the client needs (`{ featureFlags: {...}, tokens: {...}, sentryDsn: "..." }`)

### 1.2 Projects (core entity)

The project is the centre of gravity — every other resource hangs off it.

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/api/projects` | any | List visible projects. Filterable. |
| POST | `/api/projects` | admin | Create from Excel template or blank |
| GET | `/api/projects/:id` | any | Full project + latest snapshot |
| PATCH | `/api/projects/:id` | admin | Header fields only (name, address, dates, status) |
| DELETE | `/api/projects/:id` | admin | Soft delete (`deletedAt`) — never hard delete |
| POST | `/api/projects/:id/clone` | admin | Duplicate as draft |

**Query params on list:**
- `status` — `'planning' | 'land-control' | 'permitting' | 'construction' | 'marketing' | 'sold' | 'closed'`
- `phase` — alias for status, accept both
- `q` — text search on name/address
- `sortBy` — `'startDate' | 'expectedSalePrice' | 'name'`
- `cursor`, `limit`

**POST body** (`CreateProjectInput` in `lib/schemas/project.ts`):

```ts
{
  name: string,                    // 1-120 chars
  address: string,                 // free text, required
  parcelId?: string,               // optional Suffolk County reference
  startDate: string,               // ISO date; coerced to month boundary
  expectedSalePriceCents: string,  // bigint as string
  expectedSaleMonth: number,       // 1-40 in project timeline
  template: 'standard-villa' | 'blank',
  ownerCapPercent?: number,        // default 0.20
  notes?: string
}
```

Validation rules to encode in Zod (these came from Excel — DO NOT relax):
- `startDate` ≥ `2020-01-01` and ≤ `2040-12-31` (calc engine rejects outside this)
- `expectedSalePriceCents` between `100_000_00` and `100_000_000_00` (sanity bounds)
- `expectedSaleMonth` 6 ≤ x ≤ 40 (a villa can't sell in months 1-5)

### 1.3 Pricing runs (read-only in P0 — write in P1 W1.7)

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/api/projects/:id/pricing-runs` | any | List, newest first |
| GET | `/api/pricing-runs/:runId` | any | Full run + inputs + outputs |

P0 surfaces these as cards on the project detail page using runs imported from Excel. Triggering new runs comes in W1.7.

### 1.4 Capital calls (P0 must-have — Viktor flagged this is core)

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/api/projects/:id/capital-calls` | any (owner sees only own commitments unless admin) | List |
| POST | `/api/projects/:id/capital-calls` | admin | Create a call |
| GET | `/api/capital-calls/:callId` | any (filtered) | Detail |
| PATCH | `/api/capital-calls/:callId` | admin | Edit amount/due date BEFORE first commitment received |
| POST | `/api/capital-calls/:callId/commit` | owner (their share only) | Record commitment intent |
| POST | `/api/capital-calls/:callId/payments` | admin | Record received funds |
| DELETE | `/api/capital-calls/:callId` | admin | Soft delete — only if no payments yet |

**POST `/api/projects/:id/capital-calls` body:**

```ts
{
  totalAmountCents: string,         // bigint
  dueDate: string,                  // ISO date
  purpose: string,                  // "Land acquisition", "Permit fees", etc.
  splitBy: 'capPercent' | 'manual', // capPercent uses each owner's cap_percent
  manualSplits?: Array<{ ownerId: string, amountCents: string }>, // if manual
  reminderDaysBefore?: number,      // default 7
}
```

Server computes per-owner shares and creates `capital_call_owner_shares` rows in same transaction.

### 1.5 Owners & cap table

| Method | Path | Role |
|---|---|---|
| GET | `/api/owners` | any |
| GET | `/api/owners/:id` | any (owner = self or admin) |
| PATCH | `/api/owners/:id` | admin |
| GET | `/api/cap-table` | admin |
| PATCH | `/api/cap-table` | admin |

Cap table is a single global record (year 1) — Peter 38%, Lars 30%, Viktor 17%, Philip 5%, Missy 5%, Massi 2.5%, Mark 2.5%. PATCH validates sum = 1.00 exactly (to 6 decimal places of `Number`-safe precision).

### 1.6 Approval snapshots (D-011 / Hard Rule #4)

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/api/projects/:id/approval-snapshots` | any | List |
| POST | `/api/projects/:id/approval-snapshots` | admin | Create from current computed model |
| GET | `/api/approval-snapshots/:snapshotId` | any | Read — fully immutable |
| POST | `/api/approval-snapshots/:snapshotId/lock` | admin | Lock + record approver |

**Hard rule (Claude must enforce in `lib/services/project.ts`):** A project cannot move from `permitting` → `construction` unless a locked approval snapshot exists with `approvedAt within last 30 days` AND `approvedBy IN cap_table_owners`. Returning `409 CONFLICT` with `code: 'NO_APPROVAL_SNAPSHOT'`.

### 1.7 Documents (lightweight in P0)

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/api/projects/:id/documents/upload-url` | admin | Returns Vercel Blob signed upload URL |
| GET | `/api/projects/:id/documents` | any | List metadata |
| GET | `/api/documents/:docId` | any | Signed download URL (60s) |
| DELETE | `/api/documents/:docId` | admin | Soft delete |

Documents store metadata only — actual files in Vercel Blob. Never proxy file bytes through Next.js.

### 1.8 KPIs & dashboards (read-only)

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/api/kpis/portfolio` | any | Top-level Summary tab equivalents |
| GET | `/api/kpis/project/:id` | any | Single project KPIs |
| GET | `/api/portfolio/cashflow` | any | Monthly grid for portfolio chart |
| GET | `/api/portfolio/timeline` | any | Gantt data |

`/api/kpis/portfolio` response shape (locked in P0, additive only later):

```ts
{
  asOf: string,                        // ISO timestamp
  peakEquityRequiredCents: string,     // = Summary!D6
  maxDebtCents: string,                // = Summary!D8
  projectsActive: number,
  projectsPlanned: number,
  totalSoldGmvCents: string,
  totalUnsoldGmvCents: string,
  ownerEquityAtRiskCents: string,
  asOfMonth: number                    // 1-40 portfolio month index
}
```

### 1.9 Audit log

| Method | Path | Role |
|---|---|---|
| GET | `/api/audit-log` | admin |
| GET | `/api/audit-log/project/:id` | admin |

Read-only. No POST — entries created by middleware.

---

## 2. Endpoint map — P1 (Operating reality, pricing, capacity)

Added during weeks 5-27. **Do not pre-stub in P0.**

### 2.1 W1.1 — Construction tracking

| Method | Path | Role |
|---|---|---|
| GET | `/api/projects/:id/construction-stages` | any |
| PATCH | `/api/projects/:id/construction-stages/:stageId` | admin |
| POST | `/api/projects/:id/cost-variances` | admin |
| GET | `/api/projects/:id/cost-variances` | any |

### 2.2 W1.2 — Sales pipeline

| Method | Path | Role |
|---|---|---|
| GET | `/api/projects/:id/leads` | any |
| POST | `/api/projects/:id/leads` | admin |
| PATCH | `/api/leads/:leadId` | admin |
| POST | `/api/leads/:leadId/offers` | admin |
| PATCH | `/api/offers/:offerId/status` | admin |

### 2.3 W1.3 — Vendor & GC management

| Method | Path | Role |
|---|---|---|
| GET | `/api/vendors` | any |
| POST | `/api/vendors` | admin |
| GET | `/api/projects/:id/vendor-contracts` | any |
| POST | `/api/projects/:id/vendor-contracts` | admin |

### 2.4 W1.4 — Permitting tracker

| Method | Path | Role |
|---|---|---|
| GET | `/api/projects/:id/permits` | any |
| POST | `/api/projects/:id/permits` | admin |
| PATCH | `/api/permits/:permitId` | admin |

### 2.5 W1.5 — Notes & comments thread

| Method | Path | Role |
|---|---|---|
| GET | `/api/projects/:id/notes` | any |
| POST | `/api/projects/:id/notes` | any |
| PATCH | `/api/notes/:noteId` | author or admin |
| DELETE | `/api/notes/:noteId` | author or admin |

### 2.6 W1.6 — Documents v2 (versioning + tags)

Extends 1.7 — adds:

| Method | Path | Role |
|---|---|---|
| POST | `/api/documents/:docId/versions` | admin |
| GET | `/api/documents/:docId/versions` | any |
| PATCH | `/api/documents/:docId/tags` | admin |

### 2.7 W1.7 — Embedded pricing engine

This is the centrepiece — let it breathe.

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/api/projects/:id/pricing-runs` | admin | Triggers Inngest job; returns 202 + `runId` |
| GET | `/api/pricing-runs/:runId/status` | any | Poll: `'queued'\|'running'\|'succeeded'\|'failed'` |
| GET | `/api/pricing-runs/:runId/comparables` | any | W1.7.1 — comp set |
| POST | `/api/pricing-runs/:runId/comparables/:compId/exclude` | admin | Manual comp curation |
| GET | `/api/pricing-runs/:runId/hedonic` | any | W1.7.3 sidecar result |
| GET | `/api/pricing-runs/:runId/recommendation` | any | Final price band |
| POST | `/api/pricing-runs/:runId/override` | admin | Lock chosen price + rationale |

**POST `/api/projects/:id/pricing-runs` body:**

```ts
{
  asOfDate: string,                 // ISO date
  compRadiusMiles: number,          // 0.5 - 25
  compYearsBack: number,            // 1 - 5
  hedonicModel?: 'lasso' | 'gbm',   // default 'lasso'
  notes?: string
}
```

Sidecar call pattern (server-to-server, never client-facing):

```
POST /sidecar/hedonic
Headers: X-Internal-Key: ${process.env.SIDECAR_KEY}
Body: { runId, comparables: [...], features: {...} }
```

### 2.8 W1.8 — Capital capacity engine

The "when can we add another project?" engine. Five sub-endpoints matching the five sub-workstreams.

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/api/capacity/equity-curves` | any | W1.8.1 — per-owner equity-at-risk over time |
| GET | `/api/capacity/portfolio-surface` | any | W1.8.2 — capacity headroom (peak equity vs cap) |
| GET | `/api/capacity/execution-load` | any | W1.8.3 — concurrent project load |
| POST | `/api/capacity/scenarios` | admin | W1.8.4 — create capacity scenario |
| GET | `/api/capacity/scenarios` | any | List |
| GET | `/api/capacity/scenarios/:scenarioId` | any | Detail |
| PATCH | `/api/capacity/scenarios/:scenarioId` | admin | Update inputs |
| POST | `/api/capacity/scenarios/:scenarioId/run` | admin | Recompute — Inngest job |
| GET | `/api/capacity/cycle-gate` | admin | W1.8.5 — go/no-go readiness check |

**POST `/api/capacity/scenarios` body:**

```ts
{
  name: string,
  description?: string,
  hypotheticalProjects: Array<{
    label: string,
    startMonth: number,            // 1-40 from "today"
    expectedSalePriceCents: string,
    expectedDurationMonths: number,
    landCostCents: string,
    constructionCostPerSqftCents: string,
    sqft: number,
    ownerEquityPercent: number,    // typically 0.20
    debtLeveragePercent: number    // typically 0.65
  }>,
  baseline: 'current-portfolio' | 'committed-only' | 'sold-only'
}
```

Response of `GET /api/capacity/scenarios/:id` includes the computed `portfolioCashflow[]` and `equityAtRiskByOwner[]` arrays so the front-end can render charts without a second call.

### 2.9 W1.x — Excel import / export (admin tool)

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/api/excel/imports` | admin | Upload XLSX → sidecar parses → returns import job ID |
| GET | `/api/excel/imports/:importId` | admin | Status + diff vs current data |
| POST | `/api/excel/imports/:importId/apply` | admin | Commit the import (transactional) |
| POST | `/api/excel/exports/portfolio` | admin | Build XLSX matching master format → blob URL |

---

## 3. Endpoint map — explicitly OUT of scope until P2/P3

Do not build any of these in P0 or P1. They appear here to prevent Claude from "helpfully" scaffolding them.

- ❌ Public villa snapshot pages (P3)
- ❌ Mobile-specific endpoints (P3 Expo)
- ❌ AI/LLM endpoints — `/api/ai/*` (P3 W3.2)
- ❌ Webhook receivers (P2 W2.x for KPS integration)
- ❌ OneKey MLS pull (P2 per D-007)
- ❌ Two-way Excel sync (P2 W2.2)
- ❌ Email/Slack send endpoints — **Viktor explicitly forbids the agent from sending. Drafts only.**

---

## 4. Route handler skeleton (the only shape allowed)

Every route file under `app/api/.../route.ts` follows this exact pattern. No exceptions.

```ts
// app/api/projects/[id]/route.ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/lib/auth';
import { projectRepo } from '@/lib/repos/project';
import { projectService } from '@/lib/services/project';
import { UpdateProjectInput } from '@/lib/schemas/project';
import { apiResponse, apiError } from '@/lib/api-response';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, orgId } = await requireAuth(req);
  const project = await projectRepo.findById(params.id, orgId);
  if (!project) return apiError('NOT_FOUND', 'Project not found');
  return apiResponse({ project });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, orgId } = await requireRole(req, ['admin']);
  const body = UpdateProjectInput.parse(await req.json());
  const updated = await projectService.update(params.id, body, { user, orgId });
  return apiResponse({ project: updated });
}
```

**Rules** (Claude must not break these):
1. Route file ≤ 60 lines. If it grows, move logic to `lib/services/`.
2. No raw SQL in route files — repos only.
3. No `try/catch` in route handlers — global error middleware handles it.
4. No `console.log` in route handlers — use `lib/log.ts`.
5. No direct Drizzle calls — repos only.

---

## 5. Performance budgets

Per `CLAUDE.md` §9:

- `/api/kpis/portfolio` p95 ≤ 300ms
- `/api/projects/:id` p95 ≤ 250ms
- `/api/projects` (list, 20 items) p95 ≤ 400ms
- Pricing-run trigger ≤ 100ms to enqueue (heavy work in Inngest)
- Capacity scenario compute (10 hypothetical projects) ≤ 8s end-to-end via Inngest

If any endpoint exceeds budget in CI load test, fix before merge.

---

## 6. Open questions for Viktor before P1

Tracked as ADRs but worth surfacing:
1. Should `/api/capital-calls/:callId/commit` send an email to admins? **Default: no** — drafts only per Viktor's safety rules. Capture as a `pending_notification` row instead.
2. Should owners see other owners' equity-at-risk on `/api/capacity/equity-curves`? **Recommendation:** yes, with aggregate first, individual on toggle (D-011 tier 1).
3. Pricing-run idempotency window — 5 min? 1 hour? **Recommendation:** 24h (avoid accidental dupes during all-hands review).
