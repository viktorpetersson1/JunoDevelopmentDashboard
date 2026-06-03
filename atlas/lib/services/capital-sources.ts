/**
 * Capital Sources service (V6.2 T118).
 *
 * Wraps the repo with audit emission. Route handlers do auth + role gate,
 * services do business logic + audit, repos are pure SQL.
 *
 * Pattern mirrors approval-snapshot.ts and project.ts: try/catch around the
 * audit call so an audit failure NEVER blocks the user request.
 */

import { z } from 'zod';
import {
  insertCapitalSourceVersion,
  archiveCapitalSource,
  setAssignments,
  findCapitalSourceById,
} from '@/lib/repos/capital-sources';
import { recordMutation } from '@/lib/services/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

// ────────────────────────────────────────────────────────────────────────────
// Errors
// ────────────────────────────────────────────────────────────────────────────

export class CapitalSourceValidationError extends Error {
  readonly code = 'CAPITAL_SOURCE_VALIDATION';
  constructor(message: string) {
    super(message);
    this.name = 'CapitalSourceValidationError';
  }
}

export class CapitalSourceNotFoundError extends Error {
  readonly code = 'CAPITAL_SOURCE_NOT_FOUND';
  constructor(id: string) {
    super(`Capital source ${id} not found`);
    this.name = 'CapitalSourceNotFoundError';
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Schemas
// ────────────────────────────────────────────────────────────────────────────

/** Decimal as percentage (0.06 = 6%). */
const PercentDecimal = z.number().min(0).max(1).nullable().optional();

/** Decimal LTC (0.75 = 75%). */
const LtcDecimal = z.number().min(0).max(1).nullable().optional();

export const CreateCapitalSourceSchema = z.object({
  sourceKind: z.enum(['kpc_loc', 'project_finance', 'recycled_equity']),
  sourceName: z.string().trim().min(1).max(120),
  limitUsd: z.number().positive('limit_usd must be > 0'),
  drawnUsd: z.number().min(0).optional(),
  interestRatePct: PercentDecimal,           // decimal 0–1 (0.06 = 6%)
  notes: z.string().max(1000).nullable().optional(),
  covenantMaxLtcPct: LtcDecimal,             // decimal 0–1 (0.75 = 75%)
  covenantMaxConcurrentProjects: z.number().int().min(0).nullable().optional(),
  drawWindowStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  drawWindowEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  priorityOrder: z.number().int().min(0).max(100).optional(),
});

export type CreateCapitalSourceInput = z.infer<typeof CreateCapitalSourceSchema>;

/**
 * Update is a new VERSION — same shape as Create plus required `id` of the
 * row being updated. Server reads the prior row to inherit unset fields, then
 * inserts a new version with the patched fields.
 */
export const UpdateCapitalSourceSchema = CreateCapitalSourceSchema.partial().extend({
  // Anything in CreateCapitalSourceSchema is optional on update; partial() handles it.
});

export type UpdateCapitalSourceInput = z.infer<typeof UpdateCapitalSourceSchema>;

// ────────────────────────────────────────────────────────────────────────────
// createCapitalSource
// ────────────────────────────────────────────────────────────────────────────

/**
 * Create a capital source. First version → version 1. Subsequent versions of
 * the same (source_kind, source_name) bump the version + flip prior current.
 * The repo handles the bump logic.
 *
 * Caller must enforce super_admin role before calling.
 */
export async function createCapitalSource(
  input: CreateCapitalSourceInput,
  user: User,
): Promise<{ id: string; version: number }> {
  const parsed = CreateCapitalSourceSchema.parse(input);

  // Cross-field validation: end date >= start date when both set.
  if (
    parsed.drawWindowStartDate &&
    parsed.drawWindowEndDate &&
    parsed.drawWindowEndDate < parsed.drawWindowStartDate
  ) {
    throw new CapitalSourceValidationError(
      'draw_window_end_date must be on or after draw_window_start_date',
    );
  }

  const result = await insertCapitalSourceVersion({
    sourceKind: parsed.sourceKind,
    sourceName: parsed.sourceName,
    limitUsd: parsed.limitUsd,
    drawnUsd: parsed.drawnUsd ?? 0,
    interestRatePct: parsed.interestRatePct ?? null,
    notes: parsed.notes ?? null,
    covenantMaxLtcPct: parsed.covenantMaxLtcPct ?? null,
    covenantMaxConcurrentProjects: parsed.covenantMaxConcurrentProjects ?? null,
    drawWindowStartDate: parsed.drawWindowStartDate ?? null,
    drawWindowEndDate: parsed.drawWindowEndDate ?? null,
    priorityOrder: parsed.priorityOrder ?? 0,
    createdBy: user.id,
  });

  // Audit row — best-effort, never blocks the request.
  try {
    const orgId = await resolveOrgId();
    await recordMutation({
      orgId,
      userId: user.id,
      route: `service:capital_source.create:${result.id}`,
      method: 'POST',
      statusCode: 201,
      source: 'ui',
      before: null,
      after: { capitalSourceId: result.id, version: result.version, ...parsed },
    });
  } catch {
    // best-effort
  }

  return result;
}

/**
 * Update a capital source — writes a new VERSION. Reads the current row to
 * inherit any unset fields. Caller enforces super_admin role.
 */
export async function updateCapitalSource(
  id: string,
  patch: UpdateCapitalSourceInput,
  user: User,
): Promise<{ id: string; version: number }> {
  const parsed = UpdateCapitalSourceSchema.parse(patch);

  const current = await findCapitalSourceById(id);
  if (!current) throw new CapitalSourceNotFoundError(id);

  if (!current.isCurrent) {
    throw new CapitalSourceValidationError(
      `Cannot update non-current version of capital source ${id}. Update the current version instead.`,
    );
  }

  // Merge patch over current.
  const merged: CreateCapitalSourceInput = {
    sourceKind: (parsed.sourceKind ?? current.sourceKind) as CreateCapitalSourceInput['sourceKind'],
    sourceName: parsed.sourceName ?? current.sourceName,
    limitUsd: parsed.limitUsd ?? current.limitUsd,
    drawnUsd: parsed.drawnUsd ?? current.drawnUsd,
    interestRatePct: 'interestRatePct' in parsed ? parsed.interestRatePct : current.interestRatePct,
    notes: 'notes' in parsed ? parsed.notes : current.notes,
    covenantMaxLtcPct:
      'covenantMaxLtcPct' in parsed ? parsed.covenantMaxLtcPct : current.covenantMaxLtcPct,
    covenantMaxConcurrentProjects:
      'covenantMaxConcurrentProjects' in parsed
        ? parsed.covenantMaxConcurrentProjects
        : current.covenantMaxConcurrentProjects,
    drawWindowStartDate:
      'drawWindowStartDate' in parsed ? parsed.drawWindowStartDate : current.drawWindowStartDate,
    drawWindowEndDate:
      'drawWindowEndDate' in parsed ? parsed.drawWindowEndDate : current.drawWindowEndDate,
    priorityOrder: parsed.priorityOrder ?? current.priorityOrder,
  };

  if (
    merged.drawWindowStartDate &&
    merged.drawWindowEndDate &&
    merged.drawWindowEndDate < merged.drawWindowStartDate
  ) {
    throw new CapitalSourceValidationError(
      'draw_window_end_date must be on or after draw_window_start_date',
    );
  }

  const result = await insertCapitalSourceVersion({
    sourceKind: merged.sourceKind,
    sourceName: merged.sourceName,
    limitUsd: merged.limitUsd,
    drawnUsd: merged.drawnUsd ?? 0,
    interestRatePct: merged.interestRatePct ?? null,
    notes: merged.notes ?? null,
    covenantMaxLtcPct: merged.covenantMaxLtcPct ?? null,
    covenantMaxConcurrentProjects: merged.covenantMaxConcurrentProjects ?? null,
    drawWindowStartDate: merged.drawWindowStartDate ?? null,
    drawWindowEndDate: merged.drawWindowEndDate ?? null,
    priorityOrder: merged.priorityOrder ?? 0,
    createdBy: user.id,
  });

  try {
    const orgId = await resolveOrgId();
    await recordMutation({
      orgId,
      userId: user.id,
      route: `service:capital_source.update:${result.id}`,
      method: 'PATCH',
      statusCode: 200,
      source: 'ui',
      before: {
        capitalSourceId: current.id,
        version: current.version,
        limitUsd: current.limitUsd,
        drawnUsd: current.drawnUsd,
        interestRatePct: current.interestRatePct,
        covenantMaxLtcPct: current.covenantMaxLtcPct,
        covenantMaxConcurrentProjects: current.covenantMaxConcurrentProjects,
        priorityOrder: current.priorityOrder,
      },
      after: { capitalSourceId: result.id, version: result.version, ...merged },
    });
  } catch {
    // best-effort
  }

  return result;
}

/** Soft-archive a capital source. Caller enforces super_admin role. */
export async function archiveCapitalSourceWithAudit(id: string, user: User): Promise<void> {
  const current = await findCapitalSourceById(id);
  if (!current) throw new CapitalSourceNotFoundError(id);
  if (current.isArchived) return; // idempotent

  await archiveCapitalSource(id);

  try {
    const orgId = await resolveOrgId();
    await recordMutation({
      orgId,
      userId: user.id,
      route: `service:capital_source.archive:${id}`,
      method: 'DELETE',
      statusCode: 200,
      source: 'ui',
      before: { capitalSourceId: id, sourceName: current.sourceName, version: current.version },
      after: { archived: true },
    });
  } catch {
    // best-effort
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Per-project assignments
// ────────────────────────────────────────────────────────────────────────────

export const SetAssignmentsSchema = z.object({
  sourceIds: z.array(z.string().uuid()).max(20),
});

export type SetAssignmentsInput = z.infer<typeof SetAssignmentsSchema>;

/**
 * Replace a project's assignment list. Order = priority (sourceIds[0] is the
 * highest-priority source = drawn first).
 *
 * Caller (the API route) is responsible for editor+ role gate and for
 * resolving the project_key → project_uuid.
 */
export async function setProjectAssignments(
  projectUuid: string,
  input: SetAssignmentsInput,
  user: User,
): Promise<void> {
  const parsed = SetAssignmentsSchema.parse(input);
  await setAssignments(projectUuid, parsed.sourceIds, user.id);

  try {
    const orgId = await resolveOrgId();
    await recordMutation({
      orgId,
      userId: user.id,
      route: `service:capital_source.set_assignments:${projectUuid}`,
      method: 'PUT',
      statusCode: 200,
      source: 'ui',
      after: { projectId: projectUuid, sourceIds: parsed.sourceIds, count: parsed.sourceIds.length },
    });
  } catch {
    // best-effort
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Org-id resolver (shared pattern, mirrors approval-snapshot.ts)
// ────────────────────────────────────────────────────────────────────────────

let cachedOrgId: string | null = null;
async function resolveOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.schema('atlas').from('orgs').select('id').limit(1).single();
  cachedOrgId = (data as { id: string } | null)?.id ?? '00000000-0000-0000-0000-000000000000';
  return cachedOrgId;
}
