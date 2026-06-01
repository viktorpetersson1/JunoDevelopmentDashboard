/**
 * Approval-snapshot service. Business rules + audit emission.
 *
 * Rules enforced (per CLAUDE.md + bundle T063 spec):
 *
 *   1. createDraft: any editor+ can create. Captures the FULL ProjectInput
 *      and ProjectResult atomically so the snapshot is reproducible.
 *
 *   2. refreshDraft: the same admin can re-run runProject on the latest
 *      draft to update its computed_outputs after a project edit. Locked
 *      snapshots cannot be refreshed (trigger enforces; service double-
 *      checks for friendlier error).
 *
 *   3. lock: must be a DIFFERENT user than createdBy (peer review). Only
 *      super_admin can lock. Lock sets locked_at + locked_by + approved_at +
 *      seeds approved_by with [lockerId].
 *
 *   4. approve: any super_admin can append themselves to approved_by[].
 *      Idempotent: re-approving by the same admin is a no-op (not an error).
 *      Approval allowed only after lock.
 *
 *   5. archive: hides a draft or locked snapshot from the active list while
 *      preserving the row for audit. Can only archive non-archived rows.
 *
 *   6. Stage gate (deferred): permitting → construction transitions on
 *      atlas.projects should require a locked snapshot ≤ 30 days old. The
 *      check helper isLatestLockedFresh() is exposed here for future use
 *      when stage-edit UI lands; no enforcement yet (no edit UI exists).
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { recordMutation } from '@/lib/services/audit';
import { findCurrentProjectByKey } from '@/lib/repos/project';
import { runProject } from '@/lib/calc/project/runProject';
import { BASELINE_GLOBALS, BASELINE_SCENARIO } from '@/lib/calc/baselines';
import {
  findSnapshotById,
  findLatestLockedSnapshot,
  insertSnapshot,
  lockSnapshotRaw,
  appendApproverRaw,
  archiveSnapshotRaw,
  nextSnapshotVersion,
  refreshDraftSnapshot,
  type ApprovalSnapshotView,
} from '@/lib/repos/approval-snapshot';
import type { User } from '@supabase/supabase-js';

// ────────────────────────────────────────────────────────────────────────────
// Errors
// ────────────────────────────────────────────────────────────────────────────

export class SnapshotValidationError extends Error {
  readonly code = 'SNAPSHOT_VALIDATION';
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotValidationError';
  }
}

export class SnapshotPeerReviewError extends Error {
  readonly code = 'SNAPSHOT_PEER_REVIEW_REQUIRED';
  constructor(message = 'A snapshot must be locked by a different admin than its creator') {
    super(message);
    this.name = 'SnapshotPeerReviewError';
  }
}

export class SnapshotLockedError extends Error {
  readonly code = 'SNAPSHOT_LOCKED';
  constructor(message = 'Cannot mutate a locked snapshot') {
    super(message);
    this.name = 'SnapshotLockedError';
  }
}

// ────────────────────────────────────────────────────────────────────────────
// createDraftSnapshot
// ────────────────────────────────────────────────────────────────────────────

/**
 * Capture the project's current calc engine output as a new draft snapshot.
 * Caller supplies the project_key (slug); we resolve to the row + run the
 * engine ourselves so the snapshot is built from the canonical pipeline.
 */
export async function createDraftSnapshot(
  projectKey: string,
  user: User
): Promise<ApprovalSnapshotView> {
  const project = await findCurrentProjectByKey(projectKey);
  if (!project) {
    throw new SnapshotValidationError(`Project ${projectKey} not found`);
  }
  const result = runProject(project, BASELINE_GLOBALS, BASELINE_SCENARIO);

  // Resolve project uuid (project_key is the slug).
  const supabase = createSupabaseServerClient();
  const { data: projRow, error: projErr } = await supabase
    .schema('atlas')
    .from('projects')
    .select('id')
    .eq('project_key', projectKey)
    .eq('is_current', true)
    .eq('is_archived', false)
    .single();
  if (projErr || !projRow) {
    throw new SnapshotValidationError(`Project uuid lookup failed for ${projectKey}`);
  }
  const projectUuid = (projRow as { id: string }).id;

  const version = await nextSnapshotVersion(projectUuid);
  const id = await insertSnapshot({
    projectId: projectUuid,
    snapshotVersion: version,
    computedInputs: project,
    computedOutputs: result,
    createdBy: user.id,
  });

  await emitAudit(user.id, 'snapshot.create', id, {
    projectKey,
    snapshotVersion: version,
  });

  const snap = await findSnapshotById(id);
  if (!snap) {
    throw new SnapshotValidationError('Snapshot created but reload failed');
  }
  return snap;
}

// ────────────────────────────────────────────────────────────────────────────
// refreshDraft
// ────────────────────────────────────────────────────────────────────────────

/**
 * Re-run the calc engine over the project's current state and update the
 * draft's frozen content. Useful when the project was edited between
 * "create draft" and "lock" so the snapshot reflects the latest model.
 *
 * Refuses to touch a locked snapshot.
 */
export async function refreshDraft(snapshotId: string, user: User): Promise<ApprovalSnapshotView> {
  const existing = await findSnapshotById(snapshotId);
  if (!existing) throw new SnapshotValidationError(`Snapshot ${snapshotId} not found`);
  if (existing.lockedAt) {
    throw new SnapshotLockedError('Cannot refresh a locked snapshot');
  }

  // Resolve project_key from the project uuid so we can re-run runProject.
  const supabase = createSupabaseServerClient();
  const { data: projRow, error: projErr } = await supabase
    .schema('atlas')
    .from('projects')
    .select('project_key')
    .eq('id', existing.projectId)
    .single();
  if (projErr || !projRow) {
    throw new SnapshotValidationError(`Project lookup failed for snapshot ${snapshotId}`);
  }
  const projectKey = (projRow as { project_key: string }).project_key;
  const project = await findCurrentProjectByKey(projectKey);
  if (!project) {
    throw new SnapshotValidationError(`Project ${projectKey} no longer exists`);
  }
  const result = runProject(project, BASELINE_GLOBALS, BASELINE_SCENARIO);
  await refreshDraftSnapshot(snapshotId, project, result);

  await emitAudit(user.id, 'snapshot.refresh', snapshotId, {});

  const updated = await findSnapshotById(snapshotId);
  if (!updated) throw new SnapshotValidationError('Refresh succeeded but reload failed');
  return updated;
}

// ────────────────────────────────────────────────────────────────────────────
// lockSnapshot
// ────────────────────────────────────────────────────────────────────────────

/**
 * Lock a draft. Locker MUST be a different user than the snapshot's
 * createdBy — bundle T063 spec: "lock requires distinct second admin".
 *
 * Caller (the API route) is responsible for the super_admin role gate.
 */
export async function lockSnapshot(snapshotId: string, user: User): Promise<ApprovalSnapshotView> {
  const existing = await findSnapshotById(snapshotId);
  if (!existing) throw new SnapshotValidationError(`Snapshot ${snapshotId} not found`);
  if (existing.lockedAt) {
    throw new SnapshotLockedError('Snapshot is already locked');
  }
  if (existing.archivedAt) {
    throw new SnapshotValidationError('Cannot lock an archived snapshot');
  }
  if (existing.createdBy === user.id) {
    throw new SnapshotPeerReviewError();
  }
  await lockSnapshotRaw(snapshotId, user.id);

  await emitAudit(user.id, 'snapshot.lock', snapshotId, {
    snapshotVersion: existing.snapshotVersion,
    creatorId: existing.createdBy,
  });

  const locked = await findSnapshotById(snapshotId);
  if (!locked) throw new SnapshotValidationError('Lock succeeded but reload failed');
  return locked;
}

// ────────────────────────────────────────────────────────────────────────────
// approveSnapshot
// ────────────────────────────────────────────────────────────────────────────

/**
 * Append the caller to the approved_by[] array. Locked snapshots only.
 * Idempotent: re-approving by the same user is a no-op (not an error) so
 * the UI can render "Approve" without worrying about race conditions.
 */
export async function approveSnapshot(
  snapshotId: string,
  user: User
): Promise<ApprovalSnapshotView> {
  const existing = await findSnapshotById(snapshotId);
  if (!existing) throw new SnapshotValidationError(`Snapshot ${snapshotId} not found`);
  if (!existing.lockedAt) {
    throw new SnapshotValidationError('Cannot approve a draft; lock it first');
  }
  if (existing.archivedAt) {
    throw new SnapshotValidationError('Cannot approve an archived snapshot');
  }
  await appendApproverRaw(snapshotId, user.id);

  await emitAudit(user.id, 'snapshot.approve', snapshotId, {
    approverCount: existing.approvedBy.includes(user.id)
      ? existing.approvedBy.length
      : existing.approvedBy.length + 1,
  });

  const updated = await findSnapshotById(snapshotId);
  if (!updated) throw new SnapshotValidationError('Approval succeeded but reload failed');
  return updated;
}

// ────────────────────────────────────────────────────────────────────────────
// archiveSnapshot
// ────────────────────────────────────────────────────────────────────────────

export async function archiveSnapshot(snapshotId: string, user: User): Promise<void> {
  const existing = await findSnapshotById(snapshotId);
  if (!existing) throw new SnapshotValidationError(`Snapshot ${snapshotId} not found`);
  if (existing.archivedAt) return; // idempotent
  await archiveSnapshotRaw(snapshotId);
  await emitAudit(user.id, 'snapshot.archive', snapshotId, {
    wasLocked: !!existing.lockedAt,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Stage-gate helper (exposed for future stage-edit UI)
// ────────────────────────────────────────────────────────────────────────────

const STAGE_GATE_MAX_AGE_DAYS = 30;

/**
 * True when the project has a non-archived LOCKED snapshot whose lockedAt
 * is within the last STAGE_GATE_MAX_AGE_DAYS. Pre-condition for the
 * permitting → construction stage transition per CLAUDE.md / T063 spec.
 *
 * Not wired into any code path yet — exported so stage-edit code (when it
 * lands) can call it as a guard before allowing the transition.
 */
export async function isLatestLockedFresh(projectUuid: string): Promise<boolean> {
  const snap = await findLatestLockedSnapshot(projectUuid);
  if (!snap || !snap.lockedAt) return false;
  const lockedAtMs = new Date(snap.lockedAt).getTime();
  const ageMs = Date.now() - lockedAtMs;
  const maxAgeMs = STAGE_GATE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  return ageMs <= maxAgeMs;
}

// ────────────────────────────────────────────────────────────────────────────
// Audit helper (mirrors capital-call service pattern)
// ────────────────────────────────────────────────────────────────────────────

async function emitAudit(
  userId: string,
  action: string,
  resourceId: string,
  meta: Record<string, unknown>
): Promise<void> {
  try {
    const orgId = await resolveOrgId();
    await recordMutation({
      orgId,
      userId,
      route: `service:${action}:${resourceId}`,
      method: 'POST',
      statusCode: 200,
      ip: null,
      userAgent: `atlas-service meta=${JSON.stringify(meta)}`,
    });
  } catch {
    // Audit is best-effort — never block the request on it.
  }
}

let cachedOrgId: string | null = null;
async function resolveOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.schema('atlas').from('orgs').select('id').limit(1).single();
  const id = (data as { id: string } | null)?.id ?? '00000000-0000-0000-0000-000000000000';
  cachedOrgId = id;
  return id;
}
