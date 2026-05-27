/**
 * Audit-log repo. Reads atlas.audit_log for the Activity tab + admin views.
 *
 * The schema doesn't carry a project_id (audit is API-level, not domain-
 * level), so per-project queries match by route pattern:
 *
 *   - /api/projects/<project_key>%        — direct project routes
 *   - %:<resourceId>                       — service-emitted events for
 *                                            capital calls + snapshots
 *                                            belonging to the project
 *
 * Caller passes the project_key + the resource ID lists. This module
 * doesn't know about the domain — that's the caller's job.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface AuditEntryView {
  id: string;
  createdAt: string;
  userId: string | null;
  route: string;
  method: string;
  statusCode: number;
  /**
   * Display-friendly category extracted from the route.
   * 'service:capital_call.create' → category 'capital_call', action 'create'.
   * Otherwise inferred from path prefix.
   */
  category: string;
  action: string;
  /** Whichever resource id appears in the route suffix, if any. */
  resourceId: string | null;
  /** Anything from user_agent that looks like a service-emitted meta blob. */
  meta: Record<string, unknown> | null;
}

interface AuditRow {
  id: string;
  created_at: string;
  user_id: string | null;
  route: string;
  method: string;
  status_code: number;
  user_agent: string | null;
}

const SELECT_COLUMNS = 'id, created_at, user_id, route, method, status_code, user_agent';

/**
 * V4.9 — Global audit log read. Newest first, hard cap on size for the
 * /activity surface (super_admin only). No project / route filter — the
 * caller decides what to render.
 */
export async function findRecentAudit(limit = 200): Promise<AuditEntryView[]> {
  const supabase = createSupabaseServerClient();
  const cap = Math.min(Math.max(1, limit), 1000);
  const { data, error } = await supabase
    .schema('atlas')
    .from('audit_log')
    .select(SELECT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(cap);
  if (error) throw new Error(`findRecentAudit: ${error.message}`);
  return ((data as unknown as AuditRow[]) ?? []).map(toView);
}

/**
 * Find audit entries relevant to one project. Combines direct project
 * routes + service-emitted entries for the project's capital calls +
 * approval snapshots.
 *
 * Newest first. Hard cap on response size to keep the UI snappy.
 */
export async function findAuditForProject(input: {
  projectKey: string;
  capitalCallIds: string[];
  snapshotIds: string[];
  limit?: number;
}): Promise<AuditEntryView[]> {
  const supabase = createSupabaseServerClient();
  const limit = Math.min(input.limit ?? 100, 500);

  // PostgREST .or() expects comma-separated `column.op.value` clauses.
  // Like-pattern needs `*` wildcard in PostgREST syntax — but the
  // @supabase/ssr client maps .like()/.ilike() to SQL `%` correctly. We
  // therefore build .or() with `.like.` and use `*` since that's what
  // PostgREST expects in the OR clause string form.
  //
  // (PostgREST treats `*` as `%` ONLY inside .or() string filters; .like()
  // method takes raw `%`. We're building the string form here.)
  const clauses: string[] = [`route.like.*${input.projectKey}*`];
  for (const id of input.capitalCallIds) {
    clauses.push(`route.like.*:${id}*`);
  }
  for (const id of input.snapshotIds) {
    clauses.push(`route.like.*:${id}*`);
  }

  const { data, error } = await supabase
    .schema('atlas')
    .from('audit_log')
    .select(SELECT_COLUMNS)
    .or(clauses.join(','))
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`findAuditForProject: ${error.message}`);
  return ((data as unknown as AuditRow[]) ?? []).map(toView);
}

function toView(row: AuditRow): AuditEntryView {
  const { category, action, resourceId } = parseRoute(row.route);
  return {
    id: row.id,
    createdAt: row.created_at,
    userId: row.user_id,
    route: row.route,
    method: row.method,
    statusCode: row.status_code,
    category,
    action,
    resourceId,
    meta: parseMeta(row.user_agent),
  };
}

/**
 * Parse one of:
 *   - `service:capital_call.create:<uuid>`  → category=capital_call action=create resource=<uuid>
 *   - `service:snapshot.lock:<uuid>`         → category=snapshot action=lock resource=<uuid>
 *   - `/api/projects/p2`                     → category=project action=route resource=p2
 *   - `/api/capital-calls/<uuid>/payments`   → category=capital_call action=payments resource=<uuid>
 *   - `/api/approval-snapshots/<uuid>/lock`  → category=snapshot action=lock resource=<uuid>
 *   - everything else                        → category=api action=<path> resource=null
 */
function parseRoute(route: string): { category: string; action: string; resourceId: string | null } {
  if (route.startsWith('service:')) {
    const m = route.match(/^service:([^.:]+)\.([^:]+):(.+)$/);
    if (m && m[1] && m[2] && m[3]) {
      return { category: m[1], action: m[2], resourceId: m[3] };
    }
    return { category: 'service', action: route.slice('service:'.length), resourceId: null };
  }
  if (route.startsWith('/api/projects/')) {
    const m = route.match(/^\/api\/projects\/([^/]+)(?:\/(.+))?$/);
    if (m && m[1]) {
      return { category: 'project', action: m[2] ?? 'route', resourceId: m[1] };
    }
  }
  if (route.startsWith('/api/capital-calls/')) {
    const m = route.match(/^\/api\/capital-calls\/([^/]+)(?:\/(.+))?$/);
    if (m && m[1]) {
      return { category: 'capital_call', action: m[2] ?? 'route', resourceId: m[1] };
    }
  }
  if (route.startsWith('/api/approval-snapshots/')) {
    const m = route.match(/^\/api\/approval-snapshots\/([^/]+)(?:\/(.+))?$/);
    if (m && m[1]) {
      return { category: 'snapshot', action: m[2] ?? 'route', resourceId: m[1] };
    }
  }
  return { category: 'api', action: route, resourceId: null };
}

/**
 * Service-emitted entries pack meta into user_agent as
 *   "atlas-service meta=<json>"
 * so withAudit's IP-hash/user-agent column doubles as a structured-event
 * sink. Parse that back out for the UI.
 */
function parseMeta(ua: string | null): Record<string, unknown> | null {
  if (!ua) return null;
  const m = ua.match(/atlas-service meta=(\{.*\})$/);
  if (!m || !m[1]) return null;
  try {
    return JSON.parse(m[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}
