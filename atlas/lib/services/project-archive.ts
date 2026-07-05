/**
 * AJ-v3 — soft-archive a project ("delete" in exec language).
 *
 * Atlas has no hard delete: rows are versioned and referenced by approval
 * snapshots, capital calls, actuals, and risks. Archiving flips
 * is_archived=true on EVERY version of the project_key, which removes it
 * from findManyProjects / the engine / every surface while keeping the
 * audit trail intact and the operation reversible in SQL.
 *
 * Caller enforces editor+ (the Ask Juno confirm flow ALWAYS gates this
 * behind an explicit user confirmation — never auto-executed).
 */

import type { User } from '@supabase/supabase-js';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { findCurrentProjectByKey } from '@/lib/repos/project';
import { recordMutation } from '@/lib/services/audit';

export class ProjectArchiveError extends Error {}

export async function archiveProject(
  projectKey: string,
  user: User,
  orgId: string
): Promise<{ projectKey: string; name: string; auditId: string | null }> {
  const project = await findCurrentProjectByKey(projectKey);
  if (!project) {
    throw new ProjectArchiveError(`Project "${projectKey}" not found (or already archived).`);
  }

  const supabase = createSupabaseServiceRoleClient();
  const { error, count } = await supabase
    .schema('atlas')
    .from('projects')
    .update({ is_archived: true }, { count: 'exact' })
    .eq('project_key', projectKey);
  if (error) throw new ProjectArchiveError(`archiveProject: ${error.message}`);
  if (!count) throw new ProjectArchiveError(`archiveProject: no rows for "${projectKey}".`);

  let auditId: string | null = null;
  try {
    auditId = await recordMutation({
      orgId,
      userId: user.id,
      route: `service:archive_project:ask_juno:${projectKey}`,
      method: 'PATCH',
      statusCode: 200,
      source: 'ask_juno_agent',
      before: { projectKey, name: project.name, is_archived: false },
      after: { projectKey, is_archived: true, versions_archived: count },
    });
  } catch {
    // best-effort — the archive itself succeeded
  }

  return { projectKey, name: project.name, auditId };
}
