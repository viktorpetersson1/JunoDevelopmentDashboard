/**
 * Audit-log service. Writes to atlas.audit_log (created in T002 migration).
 *
 * Uses the service-role Supabase client so the insert always succeeds
 * regardless of the caller's role (the audit row is the system's own
 * record). The client bypasses RLS and is server-only — never expose.
 *
 * Trade-off note (CLAUDE.md §11.6 idempotency + T012 done-when):
 * The bundle calls for "audit row created in same DB transaction as the
 * mutation". Supabase JS doesn't expose multi-statement transactions
 * over HTTP. Two options:
 *   1. Wrap the mutation + audit in a Postgres RPC (server-side function)
 *   2. Sequential calls: mutation first, then audit. Audit failure is
 *      logged but doesn't fail the user request.
 * P0 uses option 2 for simplicity. Atomic transactional audit becomes a
 * P1 concern when we add multi-step service flows (capital calls, etc.).
 */
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { hashWithSalt } from '@/lib/utils/hash';
import { log } from '@/lib/utils/log';

/** Field names that must be redacted from before/after JSON before storage. */
const REDACT_FIELDS = new Set([
  'password',
  'password_hash',
  'passwordhash',
  'invite_token',
  'invitetoken',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'api_key',
  'apikey',
  'secret',
]);

/** Recursively replace sensitive field values with '[REDACTED]'. */
export function redactPII(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactPII);

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = REDACT_FIELDS.has(key.toLowerCase()) ? '[REDACTED]' : redactPII(v);
  }
  return out;
}

export interface AuditMutationInput {
  orgId: string;
  userId: string | null;
  route: string;
  method: string;
  statusCode: number;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Insert one audit row. Returns the new row id on success; logs and
 * returns null on failure (never throws, never fails the caller request).
 */
export async function recordMutation(input: AuditMutationInput): Promise<string | null> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .schema('atlas')
      .from('audit_log')
      .insert({
        org_id: input.orgId,
        user_id: input.userId,
        route: input.route,
        method: input.method,
        status_code: input.statusCode,
        before_json: input.before === undefined ? null : redactPII(input.before),
        after_json: input.after === undefined ? null : redactPII(input.after),
        ip_hash: input.ip ? await hashWithSalt(input.ip) : null,
        user_agent: input.userAgent ?? null,
      })
      .select('id')
      .single();

    if (error) {
      log.warn('audit insert failed', { route: input.route, error: error.message });
      return null;
    }

    return (data as { id: string }).id;
  } catch (err) {
    log.error('audit insert exception', {
      route: input.route,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
