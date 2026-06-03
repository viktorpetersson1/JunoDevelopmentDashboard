/**
 * Project UPDATE service (V6.1 T104). Orchestrates a single Inputs-editor save:
 *
 *   1. Load the current project (the audit "before" + merge base).
 *   2. Merge the validated patch over it → afterInput; recompute mirror fields.
 *   3. Run the calc engine on afterInput FIRST — if it throws, propagate and
 *      persist nothing (E7: engine errors surface verbatim; no half-edited DB).
 *   4. Persist as a version bump (applyProjectEdit — uuid stays stable).
 *   5. Write ONE audit row with full before/after JSONB + source (E9).
 *   6. Re-approval gate (E3): if a locked snapshot exists, flag the project
 *      "pending re-approval" (the existing snapshot is the baseline until a
 *      fresh one is locked). State is DERIVED — no stored flag.
 *
 * Routes call this; it trusts the caller did requireAuth + requireEditor (E1).
 * Engine is NOT touched (Hard Rule #2) — runProject reads afterInput unchanged.
 */

import type { User } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { recordMutation, type AuditSource } from '@/lib/services/audit';
import {
  findCurrentProjectByKey,
  findCurrentProjectUuidByKey,
  applyProjectEdit,
  ProjectNotFoundError,
} from '@/lib/repos/project';
import { findLatestLockedSnapshot } from '@/lib/repos/approval-snapshot';
import { enrichWithAppliedPricingRun } from '@/lib/services/project-with-pricing';
import { runProject } from '@/lib/calc/project/runProject';
import { BASELINE_GLOBALS, BASELINE_SCENARIO } from '@/lib/calc/baselines';
import { toCents } from '@/lib/utils/money';
import type { ProjectInput, ProjectResult } from '@/lib/calc/project/types';
import type { UpdateProjectInput } from './project-schema';

export { ProjectNotFoundError };

/** Thrown when runProject() fails on the new inputs. Carries the verbatim
 *  engine message so the API can surface it (E7) rather than a generic 500. */
export class CalcEngineError extends Error {
  readonly code = 'CALC_ENGINE_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'CalcEngineError';
  }
}

export interface UpdateProjectParams {
  projectKey: string;
  patch: UpdateProjectInput;
  user: User;
  source?: AuditSource;
}

export interface UpdateProjectResult {
  project: ProjectInput;
  result: ProjectResult;
  version: number;
  /** True when a locked snapshot exists — edit succeeds but project is now
   *  "pending re-approval" (E3). The locked snapshot stays the baseline. */
  requiresReapproval: boolean;
  /** lockedAt of the snapshot that now needs re-approval, ISO. */
  lockedSnapshotDate: string | null;
  /** Audit-log row id for this edit (surfaced to Ask Juno + the UI). */
  auditId: string | null;
}

/** Map the validated patch (ProjectInput units) → raw atlas.projects columns
 *  (cents/bps). Only keys present in the patch are emitted. Exported for tests. */
export function buildColumnPatch(patch: UpdateProjectInput): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  const bps = (v: number) => Math.round(v * 10000);

  // Schedule
  if (patch.purchase_date !== undefined) c.purchase_date = patch.purchase_date;
  if (patch.sourcing_months !== undefined) c.sourcing_months = patch.sourcing_months;
  if (patch.permitting_preconstruction_months !== undefined)
    c.permitting_preconstruction_months = patch.permitting_preconstruction_months;
  if (patch.construction_months !== undefined) c.construction_months = patch.construction_months;
  if (patch.sales_months !== undefined) c.sales_months = patch.sales_months;
  // Villa
  if (patch.villa_sqft_ag !== undefined) c.villa_sqft_ag = patch.villa_sqft_ag;
  if (patch.villa_sqft_bg !== undefined) c.villa_sqft_bg = patch.villa_sqft_bg;
  // Costs (dollars → cents)
  if (patch.land_cost_usd !== undefined) c.land_cost_cents = toCents(patch.land_cost_usd);
  if (patch.build_cost_per_sqft !== undefined)
    c.build_cost_per_sqft_cents =
      patch.build_cost_per_sqft == null ? null : toCents(patch.build_cost_per_sqft);
  if (patch.soft_costs_lump_sum !== undefined)
    c.soft_costs_lump_sum_cents = toCents(patch.soft_costs_lump_sum);
  // Financing (decimals → bps)
  if (patch.lender_name !== undefined) c.lender_name = patch.lender_name;
  if (patch.senior_ltv_pct !== undefined) c.senior_ltv_bps = bps(patch.senior_ltv_pct);
  if (patch.interest_rate_apr !== undefined)
    c.interest_rate_bps = patch.interest_rate_apr == null ? null : bps(patch.interest_rate_apr);
  // Targets
  if (patch.sale_price_override_usd !== undefined)
    c.sale_price_override_cents =
      patch.sale_price_override_usd == null ? null : toCents(patch.sale_price_override_usd);
  if (patch.sale_price_per_sqft_override !== undefined)
    c.sale_price_per_sqft_override_cents =
      patch.sale_price_per_sqft_override == null
        ? null
        : toCents(patch.sale_price_per_sqft_override);
  if (patch.target_margin !== undefined)
    c.target_margin_bps = patch.target_margin == null ? null : bps(patch.target_margin);
  // Tax (% → bps; 25 → 2500)
  if (patch.tax_rate_pct !== undefined) c.tax_rate_bps = Math.round(patch.tax_rate_pct * 100);
  // V6.1 T107 — cost_breakdown JSONB (nullable). Pattern mirrors other_fees:
  // pass through verbatim when the key is present in the patch (incl. null
  // to clear). Engine NEVER reads this column (Hard Rule #2).
  if (patch.cost_breakdown !== undefined) c.cost_breakdown = patch.cost_breakdown;

  return c;
}

/** Merge the patch over the current ProjectInput and recompute the legacy
 *  mirror fields the engine reads (start_date / villa_sqft / program_months).
 *  Exported for tests. */
export function mergeAfterInput(before: ProjectInput, patch: UpdateProjectInput): ProjectInput {
  const after: ProjectInput = { ...before, ...patch } as ProjectInput;
  after.villa_sqft = (after.villa_sqft_ag ?? 0) + (after.villa_sqft_bg ?? 0);
  const months =
    (after.sourcing_months ?? 0) +
    (after.permitting_preconstruction_months ?? 0) +
    (after.construction_months ?? 0) +
    (after.sales_months ?? 0);
  after.program_months = months || 13;
  after.start_date = after.purchase_date ?? after.start_date ?? '2026-01';
  return after;
}

export async function updateProject(params: UpdateProjectParams): Promise<UpdateProjectResult> {
  const { projectKey, patch, user, source = 'ui' } = params;

  // 1. Load current (before) + stable uuid.
  const before = await findCurrentProjectByKey(projectKey);
  if (!before) throw new ProjectNotFoundError(projectKey);
  const projectUuid = await findCurrentProjectUuidByKey(projectKey);

  // 2. Merge → afterInput.
  const afterInput = mergeAfterInput(before, patch);

  // 3. Run the engine on afterInput BEFORE persisting (E7). enrich is a no-op
  //    for projects without an applied pricing run. A throw here propagates to
  //    the API → modal banner, and nothing is written.
  const enriched = await enrichWithAppliedPricingRun(afterInput, projectUuid);
  let result: ProjectResult;
  try {
    result = runProject(enriched, BASELINE_GLOBALS, BASELINE_SCENARIO);
  } catch (err) {
    // E7 + Hard Rule #2: surface the verbatim engine error, never swallow it
    // and never patch the engine to make it pass.
    throw new CalcEngineError(err instanceof Error ? err.message : String(err));
  }

  // 4. Persist (version bump; uuid stable).
  const columnPatch = buildColumnPatch(patch);
  const { version } = await applyProjectEdit({
    projectKey,
    columnPatch,
    editedBy: user.id,
    editSource: source,
  });

  // 5. Audit — full before/after JSONB, tagged with the source surface (E9).
  const orgId = await resolveOrgId();
  const auditId = await recordMutation({
    orgId,
    userId: user.id,
    route: `/api/projects/${projectKey}`,
    method: 'PATCH',
    statusCode: 200,
    before,
    after: afterInput,
    source,
  });

  // 6. Re-approval gate (E3): a locked snapshot means this edit now needs
  //    re-approval. State is derived from the snapshot, not stored.
  const locked = projectUuid ? await findLatestLockedSnapshot(projectUuid) : null;

  return {
    project: afterInput,
    result,
    version,
    requiresReapproval: !!locked,
    lockedSnapshotDate: locked?.lockedAt ?? null,
    auditId,
  };
}

// ── org-id resolution (mirrors approval-snapshot service) ───────────────────
let cachedOrgId: string | null = null;
async function resolveOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.schema('atlas').from('orgs').select('id').limit(1).single();
  const id = (data as { id: string } | null)?.id ?? '00000000-0000-0000-0000-000000000000';
  cachedOrgId = id;
  return id;
}
