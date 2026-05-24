# T012 — Audit-log middleware

**Goal:** Every mutating API route auto-records one row in `atlas.audit_log` (table from T002). Captures userId, orgId, route, method, statusCode, before/after JSON, ipHash, userAgent, timestamp. PII redaction for sensitive field names.

## What changed

### New files
- `atlas/lib/utils/hash.ts` — `hashWithSalt(input)` SHA-256(salt + input) → 32 hex chars. Reads `AUDIT_HASH_SALT` env (falls back to a stable dev salt).
- `atlas/lib/services/audit.ts` — `recordMutation(input)` writes one row via the service-role client (RLS bypass). Includes `redactPII()` that recursively replaces values of sensitive field names with `[REDACTED]` (password, password_hash, invite_token, access_token, refresh_token, api_key, secret).
- `atlas/lib/api/withAudit.ts` — `withAudit(handler)` wrapper for mutating route handlers. Auto-records method+route+status+ip+UA after the response. GET / OPTIONS / HEAD are passed through unchanged. Best-effort: failures are logged, never block the response.
- `atlas/lib/services/__tests__/audit.test.ts` — 4 tests for `redactPII`.
- `atlas/lib/utils/__tests__/hash.test.ts` — 4 tests for `hashWithSalt`.

### Composition
```ts
export const POST = withErrorBoundary(withAudit(async (req) => {
  const { user, profile } = await requireAuth();
  requireRole(profile, ['super_admin', 'editor']);
  // ... mutation logic
  return ok({ id });
}));
```

## Deviations from bundle (logged)

- **Audit row + mutation NOT in a single DB transaction** — Supabase JS doesn't expose multi-statement transactions over HTTP. P0 does sequential writes (mutation first, audit after; audit failures log but don't fail the user request). Atomic transactional audit becomes a P1 concern once we have multi-step service flows (capital calls, snapshot creation) that justify a Postgres RPC.
- **Coarse before/after via withAudit** — the wrapper records method+route+status only. Routes that need before/after snapshots call `recordMutation()` directly from the handler (gives full domain context).
- **`orgId` resolution is naive** — single-tenant P0: reads the one seeded `atlas.orgs` row on every request. P1 caches it or moves to session.

## Verified
- `pnpm lint` → 0
- `pnpm typecheck` → 0
- `pnpm test` → 49/49 files, **187/187 tests** (8 new — `redactPII` × 4 + `hashWithSalt` × 4)

## Done-when
- [x] Service function `recordMutation()` writes to `atlas.audit_log` with the bundle-specified fields
- [x] `before`/`after` redaction for sensitive field names
- [x] IP stored as SHA-256-with-salt hash (CLAUDE.md §18 PII)
- [x] `withAudit(handler)` wrapper for mutating routes
- [x] Audit failure never propagates to the user response
- [x] Tests for redaction + hash determinism + salt independence
- [N/A] Same-transaction rollback test — deferred; needs RPC-based mutations (P1)
- [N/A] Live integration test against atlas.audit_log — deferred to T076 (real session)
