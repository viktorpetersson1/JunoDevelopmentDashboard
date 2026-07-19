/**
 * Scenarios repo — atlas.scenarios table (V4.5, INVENTORY §19).
 *
 * Persists user-defined what-if scenarios layered on top of the base
 * case. The base case itself is a constant (atlas/lib/calc/baselines.ts);
 * this table only holds USER variants.
 *
 * Mutations gated by editor+ at the API layer. Read-allow at the RLS
 * layer for any authenticated user.
 */

import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import type { Scenario } from '@/lib/calc/project/types';

export type ScenarioClass = 'base' | 'lender' | 'upside' | 'downside' | 'custom';

export interface ScenarioView extends Scenario {
  id: string;
  name: string;
  class: ScenarioClass;
  locked: boolean;
  interest_rate_delta_bps: number;
  build_cost_multiplier: number;
  sale_price_multiplier: number;
  margin_override: number | null;
  timing_shift_months: number;
  excluded_project_ids: string[];
  /** V6.2 T124 — optional starts/year for the Scenario Modeler. Null = use the
   *  org velocity target. Persistence-only; NOT a calc-engine input. */
  starts_per_year_override: number | null;
  createdBy: string | null;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
}

interface ScenarioRow {
  id: string;
  name: string;
  class: ScenarioClass;
  locked: boolean;
  interest_rate_delta_bps: number;
  build_cost_multiplier: number | string;
  sale_price_multiplier: number | string;
  margin_override: number | string | null;
  timing_shift_months: number;
  excluded_project_ids: string[];
  starts_per_year_override: number | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

const ROW_SELECT =
  'id, name, class, locked, interest_rate_delta_bps, build_cost_multiplier, sale_price_multiplier, margin_override, timing_shift_months, excluded_project_ids, starts_per_year_override, created_by, created_at, updated_by, updated_at';

export async function findManyScenarios(): Promise<ScenarioView[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('scenarios')
    .select(ROW_SELECT)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`findManyScenarios: ${error.message}`);
  return ((data as unknown as ScenarioRow[]) ?? []).map(normalize);
}

export async function findScenarioById(id: string): Promise<ScenarioView | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('scenarios')
    .select(ROW_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`findScenarioById: ${error.message}`);
  return data ? normalize(data as unknown as ScenarioRow) : null;
}

export interface ScenarioInput {
  name: string;
  class: ScenarioClass;
  locked?: boolean;
  interest_rate_delta_bps: number;
  build_cost_multiplier: number;
  sale_price_multiplier: number;
  margin_override: number | null;
  timing_shift_months: number;
  excluded_project_ids: string[];
  /** V6.2 T124 — optional starts/year. Null = use org velocity target. */
  starts_per_year_override?: number | null;
}

export async function insertScenario(
  input: ScenarioInput,
  createdBy: string
): Promise<ScenarioView> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('scenarios')
    .insert({ ...input, created_by: createdBy, updated_by: createdBy })
    .select(ROW_SELECT)
    .single();
  if (error || !data) throw new Error(`insertScenario: ${error?.message ?? 'no row'}`);
  return normalize(data as unknown as ScenarioRow);
}

export async function updateScenario(
  id: string,
  patch: Partial<ScenarioInput>,
  updatedBy: string
): Promise<ScenarioView> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('scenarios')
    .update({ ...patch, updated_by: updatedBy })
    .eq('id', id)
    .select(ROW_SELECT)
    .single();
  if (error || !data) throw new Error(`updateScenario: ${error?.message ?? 'no row'}`);
  return normalize(data as unknown as ScenarioRow);
}

export async function deleteScenario(id: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.schema('atlas').from('scenarios').delete().eq('id', id);
  if (error) throw new Error(`deleteScenario: ${error.message}`);
}

/**
 * Convert a ScenarioView to the Scenario shape the calc engine expects.
 * Strips persistence metadata; aliases the user-friendly fields.
 */
export function viewToCalcScenario(s: ScenarioView): Scenario {
  return {
    name: s.name,
    class: s.class,
    locked: s.locked,
    interest_rate_delta_bps: s.interest_rate_delta_bps,
    build_cost_multiplier: s.build_cost_multiplier,
    sale_price_multiplier: s.sale_price_multiplier,
    margin_override: s.margin_override,
    timing_shift_months: s.timing_shift_months,
    excluded_project_ids: s.excluded_project_ids,
  };
}

function normalize(row: ScenarioRow): ScenarioView {
  return {
    id: row.id,
    name: row.name,
    class: row.class,
    locked: row.locked,
    interest_rate_delta_bps: row.interest_rate_delta_bps,
    // Numeric columns sometimes come back as strings via PostgREST — coerce.
    build_cost_multiplier: Number(row.build_cost_multiplier),
    sale_price_multiplier: Number(row.sale_price_multiplier),
    margin_override: row.margin_override == null ? null : Number(row.margin_override),
    timing_shift_months: row.timing_shift_months,
    excluded_project_ids: row.excluded_project_ids ?? [],
    starts_per_year_override:
      row.starts_per_year_override == null ? null : Number(row.starts_per_year_override),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}
