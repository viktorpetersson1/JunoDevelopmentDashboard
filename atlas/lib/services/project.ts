/**
 * Project service — writes to atlas.projects. Per CLAUDE.md §5, routes
 * call services, services call repos. Services hold transactional logic +
 * audit emission; repos are pure SQL.
 *
 * v1 covers create + key-slug generation. update / archive / version-bump
 * paths land with later tickets.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { toCents } from '@/lib/utils/money';
import type { User } from '@supabase/supabase-js';
import { CreateProjectSchema, type CreateProjectInput } from './project-schema';

// Re-export so existing imports of CreateProjectSchema / CreateProjectInput
// from '@/lib/services/project' still resolve.
export { CreateProjectSchema, type CreateProjectInput };

// ────────────────────────────────────────────────────────────────────────────
// project_key generation
// ────────────────────────────────────────────────────────────────────────────

/** Strip to lowercase alphanum + hyphen, collapse repeats, trim hyphens. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Find a project_key not already taken. Falls back to -2, -3, ... on collision. */
async function pickUniqueKey(baseSlug: string): Promise<string> {
  const supabase = createSupabaseServerClient();
  const root = baseSlug || 'project';
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const { data, error } = await supabase
      .schema('atlas')
      .from('projects')
      .select('id')
      .eq('project_key', candidate)
      .limit(1);
    if (error) throw new Error(`pickUniqueKey: ${error.message}`);
    if (!data || data.length === 0) return candidate;
  }
  // Pathological: 20 collisions. Fall back to a timestamped suffix.
  return `${root}-${Date.now().toString(36)}`;
}

// ────────────────────────────────────────────────────────────────────────────
// createProject — main entry point
// ────────────────────────────────────────────────────────────────────────────

export interface CreateProjectResult {
  id: string;
  projectKey: string;
  version: number;
}

/**
 * Insert a new project. Returns the new row's id + project_key.
 *
 * Auth: caller must enforce role gate (editor or super_admin) before
 * calling. This service trusts the caller; it doesn't re-check auth.
 *
 * The DB-level partial unique index on (project_key) WHERE is_current=true
 * + the trigger preventing two current rows with the same key make this
 * race-safe even under concurrent inserts.
 */
export async function createProject(
  input: CreateProjectInput,
  user: User
): Promise<CreateProjectResult> {
  const parsed = CreateProjectSchema.parse(input);

  const projectKey = await pickUniqueKey(slugify(parsed.name));
  const supabase = createSupabaseServerClient();

  const row = {
    project_key: projectKey,
    version: 1,
    is_current: true,
    is_archived: false,

    name: parsed.name,
    address: parsed.address ?? null,
    google_maps_url: parsed.google_maps_url ?? null,
    entity_spv: parsed.entity_spv ?? null,

    market_id: parsed.market_id,
    asset_type: parsed.asset_type,
    status: parsed.status,
    stage: parsed.stage,

    // Location factors (D-025b)
    waterfront_type: parsed.waterfront_type ?? null,
    lot_size_acres: parsed.lot_size_acres ?? null,
    year_built: parsed.year_built ?? null,
    view_premium: parsed.view_premium ?? null,
    town_proximity: parsed.town_proximity ?? null,

    purchase_date: parsed.purchase_date,
    sourcing_months: parsed.sourcing_months,
    permitting_preconstruction_months: parsed.permitting_preconstruction_months,
    construction_months: parsed.construction_months,
    sales_months: parsed.sales_months,
    villa_sqft_ag: parsed.villa_sqft_ag,
    villa_sqft_bg: parsed.villa_sqft_bg,

    land_cost_cents: toCents(parsed.land_cost_usd),
    build_cost_per_sqft_cents:
      parsed.build_cost_per_sqft != null ? toCents(parsed.build_cost_per_sqft) : null,
    soft_costs_lump_sum_cents: toCents(parsed.soft_costs_lump_sum),

    // Other financial fields default to schema-level defaults; the wizard
    // doesn't collect them in v1.
    created_by: user.id,
  };

  const { data, error } = await supabase
    .schema('atlas')
    .from('projects')
    .insert(row)
    .select('id, project_key, version')
    .single();

  if (error) {
    // 23505 = unique_violation — extremely unlikely after pickUniqueKey but
    // we surface it explicitly so the API can return 409.
    if (error.code === '23505') {
      throw new ProjectKeyCollisionError(projectKey);
    }
    throw new Error(`createProject insert failed: ${error.message}`);
  }

  return {
    id: data.id as string,
    projectKey: data.project_key as string,
    version: data.version as number,
  };
}

export class ProjectKeyCollisionError extends Error {
  readonly code = 'PROJECT_KEY_COLLISION';
  constructor(public projectKey: string) {
    super(`project_key "${projectKey}" already exists`);
    this.name = 'ProjectKeyCollisionError';
  }
}
