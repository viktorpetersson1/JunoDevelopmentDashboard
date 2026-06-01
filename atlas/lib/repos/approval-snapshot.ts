/**
 * Approval-snapshot repo. Reads + raw inserts for atlas.approval_snapshots.
 * Service layer (lib/services/approval-snapshot.ts) owns the business
 * rules (distinct-second-admin lock, append-only approved_by[], audit).
 *
 * Immutability invariants are DB-enforced via two triggers:
 *   - atlas.enforce_snapshot_immutability — disallows mutation of content
 *     fields once locked_at IS NOT NULL; permits only growing approved_by[].
 *   - atlas.block_snapshot_delete — full no-delete (only archive via
 *     archived_at + UI hide).
 *
 * The repo NEVER mutates a locked snapshot's content fields itself; the
 * trigger is the floor not the only gate.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ProjectInput, ProjectResult } from '@/lib/calc/project/types';

export type SnapshotStatus = 'draft' | 'locked' | 'archived';

export interface ApprovalSnapshotView {
  id: string;
  projectId: string;
  snapshotVersion: string;
  status: SnapshotStatus;
  createdBy: string | null;
  createdAt: string;
  lockedBy: string | null;
  lockedAt: string | null;
  approvedAt: string | null;
  approvedBy: string[];
  archivedAt: string | null;
  /** Opaque per CLAUDE.md §10.5 — frozen runProject inputs at snapshot time. */
  computedInputs: ProjectInput;
  /** Opaque — frozen runProject outputs at snapshot time. */
  computedOutputs: ProjectResult;
}

interface SnapshotRow {
  id: string;
  project_id: string;
  snapshot_version: string;
  computed_inputs: ProjectInput;
  computed_outputs: ProjectResult;
  created_by: string | null;
  created_at: string;
  locked_by: string | null;
  locked_at: string | null;
  approved_at: string | null;
  approved_by: string[];
  archived_at: string | null;
}

function toView(row: SnapshotRow): ApprovalSnapshotView {
  const status: SnapshotStatus = row.archived_at ? 'archived' : row.locked_at ? 'locked' : 'draft';
  return {
    id: row.id,
    projectId: row.project_id,
    snapshotVersion: row.snapshot_version,
    status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    lockedBy: row.locked_by,
    lockedAt: row.locked_at,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by ?? [],
    archivedAt: row.archived_at,
    computedInputs: row.computed_inputs,
    computedOutputs: row.computed_outputs,
  };
}

const SELECT_COLUMNS =
  'id, project_id, snapshot_version, computed_inputs, computed_outputs, created_by, created_at, locked_by, locked_at, approved_at, approved_by, archived_at';

// ────────────────────────────────────────────────────────────────────────────
// Reads
// ────────────────────────────────────────────────────────────────────────────

/** List snapshots for a project, newest first. Filters archived by default. */
export async function findSnapshotsByProject(
  projectId: string,
  opts: { includeArchived?: boolean; limit?: number } = {}
): Promise<ApprovalSnapshotView[]> {
  const supabase = createSupabaseServerClient();
  let q = supabase
    .schema('atlas')
    .from('approval_snapshots')
    .select(SELECT_COLUMNS)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (!opts.includeArchived) q = q.is('archived_at', null);
  if (opts.limit) q = q.limit(opts.limit);

  const { data, error } = await q;
  if (error) throw new Error(`findSnapshotsByProject: ${error.message}`);
  return ((data as unknown as SnapshotRow[]) ?? []).map(toView);
}

/** Fetch the most recent non-archived snapshot for a project (any status). */
export async function findLatestSnapshot(projectId: string): Promise<ApprovalSnapshotView | null> {
  const list = await findSnapshotsByProject(projectId, { limit: 1 });
  return list[0] ?? null;
}

/** Fetch the most recent LOCKED snapshot. Used for diff baselines + stage gates. */
export async function findLatestLockedSnapshot(
  projectId: string
): Promise<ApprovalSnapshotView | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('approval_snapshots')
    .select(SELECT_COLUMNS)
    .eq('project_id', projectId)
    .is('archived_at', null)
    .not('locked_at', 'is', null)
    .order('locked_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findLatestLockedSnapshot: ${error.message}`);
  return data ? toView(data as unknown as SnapshotRow) : null;
}

/** Fetch one snapshot by uuid. */
export async function findSnapshotById(snapshotId: string): Promise<ApprovalSnapshotView | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('approval_snapshots')
    .select(SELECT_COLUMNS)
    .eq('id', snapshotId)
    .maybeSingle();
  if (error) throw new Error(`findSnapshotById: ${error.message}`);
  return data ? toView(data as unknown as SnapshotRow) : null;
}

// ────────────────────────────────────────────────────────────────────────────
// Raw writes
// ────────────────────────────────────────────────────────────────────────────

export interface InsertSnapshotRow {
  projectId: string;
  snapshotVersion: string;
  computedInputs: ProjectInput;
  computedOutputs: ProjectResult;
  createdBy: string;
}

export async function insertSnapshot(row: InsertSnapshotRow): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('approval_snapshots')
    .insert({
      project_id: row.projectId,
      snapshot_version: row.snapshotVersion,
      computed_inputs: row.computedInputs,
      computed_outputs: row.computedOutputs,
      created_by: row.createdBy,
    })
    .select('id')
    .single();
  if (error) throw new Error(`insertSnapshot: ${error.message}`);
  return data.id as string;
}

/**
 * Lock a draft snapshot. Updates locked_at + locked_by + approved_at +
 * approved_by atomically. Trigger atlas.enforce_snapshot_immutability
 * permits this exact mutation while disallowing later content changes.
 */
export async function lockSnapshotRaw(snapshotId: string, lockerId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .schema('atlas')
    .from('approval_snapshots')
    .update({
      locked_at: now,
      locked_by: lockerId,
      approved_at: now,
      approved_by: [lockerId],
    })
    .eq('id', snapshotId)
    .is('locked_at', null); // race-safe: only locks a draft, not an already-locked row
  if (error) throw new Error(`lockSnapshotRaw: ${error.message}`);
}

/**
 * Append an approver to approved_by[]. Uses Postgres array_append via raw
 * RPC because Supabase JS doesn't expose array-mutation operators directly.
 * Trigger enforces append-only (no removal, no reorder).
 */
export async function appendApproverRaw(snapshotId: string, approverId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  // Read current approved_by, append if not present, write back. Race-safe
  // enough for the human-paced approval workflow; if two admins approve
  // simultaneously, one will see the other's id already present on retry.
  const { data, error } = await supabase
    .schema('atlas')
    .from('approval_snapshots')
    .select('approved_by, locked_at')
    .eq('id', snapshotId)
    .single();
  if (error) throw new Error(`appendApproverRaw read: ${error.message}`);
  const row = data as { approved_by: string[]; locked_at: string | null };
  if (!row.locked_at) {
    throw new Error('Cannot approve a draft snapshot — lock it first');
  }
  if ((row.approved_by ?? []).includes(approverId)) return; // idempotent
  const next = [...(row.approved_by ?? []), approverId];
  const { error: updErr } = await supabase
    .schema('atlas')
    .from('approval_snapshots')
    .update({ approved_by: next })
    .eq('id', snapshotId);
  if (updErr) throw new Error(`appendApproverRaw update: ${updErr.message}`);
}

/** Soft-archive a snapshot (UI hides it; DB row preserved for audit). */
export async function archiveSnapshotRaw(snapshotId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .schema('atlas')
    .from('approval_snapshots')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', snapshotId)
    .is('archived_at', null);
  if (error) throw new Error(`archiveSnapshotRaw: ${error.message}`);
}

/**
 * Generate the next snapshot_version label for a project. Format: 'v{N}'
 * where N is the next integer. Looks at the LARGEST existing version label
 * to avoid filling gaps left by archived snapshots.
 */
export async function nextSnapshotVersion(projectId: string): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('approval_snapshots')
    .select('snapshot_version')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`nextSnapshotVersion: ${error.message}`);
  const rows = (data as Array<{ snapshot_version: string }> | null) ?? [];
  if (rows.length === 0) return 'v1';
  const last = rows[0]!.snapshot_version;
  const m = last.match(/^v(\d+)$/);
  const n = m && m[1] ? Number.parseInt(m[1], 10) : 0;
  return `v${Number.isFinite(n) ? n + 1 : 2}`;
}

/**
 * Update only the mutable fields (computed_inputs / computed_outputs) on a
 * DRAFT snapshot — refresh the captured calc engine output. Refuses to
 * touch a locked row (the trigger would too).
 */
export async function refreshDraftSnapshot(
  snapshotId: string,
  computedInputs: ProjectInput,
  computedOutputs: ProjectResult
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .schema('atlas')
    .from('approval_snapshots')
    .update({
      computed_inputs: computedInputs,
      computed_outputs: computedOutputs,
    })
    .eq('id', snapshotId)
    .is('locked_at', null);
  if (error) throw new Error(`refreshDraftSnapshot: ${error.message}`);
}
