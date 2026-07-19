/**
 * POST /api/ask-juno/revert — AJ-v4: undo an Ask Juno figure update.
 *
 * Takes { audit_log_id } for an `update_project` write the pane executed
 * (source ask_juno_agent) and re-applies the captured BEFORE values through
 * the same validated PATCH path the original write used — so validation,
 * versioning and snapshot guards all still apply. The revert itself is
 * audited (source ask_juno_agent, route service:revert:ask_juno:<key>),
 * which also means a revert can be reverted.
 *
 * Scope (deliberate): only update_project rows with captured before-values
 * revert; creates/archives keep their existing admin paths.
 * Editor+ only.
 */
import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest, notFound } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { recordMutation } from '@/lib/services/audit';
import { updateProject } from '@/lib/services/project-update';
import { UpdateProjectSchema } from '@/lib/services/project-schema';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

const BodySchema = z.object({ audit_log_id: z.string().uuid() });

interface AuditRow {
  id: string;
  org_id: string;
  route: string;
  source: string;
  before_json: { projectKey?: string; fields?: Record<string, unknown> } | null;
}

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest('audit_log_id (uuid) required', 'VALIDATION_FAILED');

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service
    .schema('atlas')
    .from('audit_log')
    .select('id, org_id, route, source, before_json')
    .eq('id', parsed.data.audit_log_id)
    .maybeSingle();
  if (error) throw new Error(`revert lookup: ${error.message}`);
  const row = data as AuditRow | null;
  if (!row) return notFound('Audit entry not found');

  if (row.source !== 'ask_juno_agent' || !row.route.startsWith('service:update_project:ask_juno')) {
    return badRequest(
      'Only Ask Juno project-figure updates can be reverted here',
      'NOT_REVERTIBLE'
    );
  }
  const projectKey = row.before_json?.projectKey;
  const fields = row.before_json?.fields;
  if (!projectKey || !fields || Object.keys(fields).length === 0) {
    return badRequest(
      'This write has no captured before-values (older entry) — restore manually from the audit log',
      'NOT_REVERTIBLE'
    );
  }

  // Sanity: the project must still exist and be current.
  const supabase = createSupabaseServerClient();
  const { data: proj } = await supabase
    .schema('atlas')
    .from('projects')
    .select('project_key')
    .eq('project_key', projectKey)
    .eq('is_current', true)
    .limit(1)
    .maybeSingle();
  if (!proj) return notFound(`Project ${projectKey} no longer exists`);

  // FIX (19 Jul): apply the before-values via the service DIRECTLY — the
  // previous internal fetch to /api/projects fails in production because
  // Cloudflare blocks a Pages Function from fetching its own hostname.
  // Same validation, same versioning/snapshot guards, same audit trail.
  const revertPatch = UpdateProjectSchema.safeParse(fields);
  if (!revertPatch.success) {
    return badRequest(
      `Revert failed: captured before-values no longer validate — ${revertPatch.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'REVERT_FAILED'
    );
  }
  try {
    await updateProject({
      projectKey,
      patch: revertPatch.data,
      user,
      source: 'ask_juno_agent',
    });
  } catch (err) {
    return badRequest(
      `Revert failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      'REVERT_FAILED'
    );
  }

  const auditId = await recordMutation({
    orgId: row.org_id,
    userId: user.id,
    route: `service:revert:ask_juno:${projectKey}`,
    method: 'PATCH',
    statusCode: 200,
    source: 'ask_juno_agent',
    before: { revertedAuditLogId: row.id },
    after: { projectKey, fields },
  });

  return ok({ reverted: true, project_key: projectKey, audit_log_id: auditId });
});
