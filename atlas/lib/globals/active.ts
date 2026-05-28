/**
 * V4.11b — active globals helper.
 *
 * Reads the single-row atlas.globals table and merges any non-null
 * overrides over BASELINE_GLOBALS. Falls back to pure baseline when
 * the row is absent or the DB call fails.
 *
 * Server-side only. Pure for callers (no side effects beyond the
 * underlying network read).
 *
 * Mirror of lib/scenarios/active.ts pattern — same "cookie? no.
 * single source-of-truth row" simplification, since globals are an
 * org-wide setting not a per-user preference.
 */

import { BASELINE_GLOBALS } from '@/lib/calc/baselines';
import { fetchGlobalsRow, type GlobalsRow } from '@/lib/repos/globals';
import type { Globals } from '@/lib/calc/project/types';

export async function getActiveGlobals(): Promise<{
  globals: Globals;
  /** True when no override row exists OR every override is null. */
  isBaseline: boolean;
  /** ISO timestamp of last update, null when unset. */
  updatedAt: string | null;
}> {
  let row: GlobalsRow | null = null;
  try {
    row = await fetchGlobalsRow();
  } catch {
    return { globals: BASELINE_GLOBALS, isBaseline: true, updatedAt: null };
  }
  if (!row) {
    return { globals: BASELINE_GLOBALS, isBaseline: true, updatedAt: null };
  }
  const merged = mergeOverBaseline(row);
  const isBaseline = !hasAnyOverride(row);
  return { globals: merged, isBaseline, updatedAt: row.updated_at };
}

/**
 * Field-by-field merge: take override when non-null, fall back to
 * baseline otherwise. Numeric coercion (PostgREST returns numerics as
 * strings sometimes) happens here so every downstream caller gets a
 * regular Globals object.
 */
function mergeOverBaseline(row: GlobalsRow): Globals {
  const num = (v: number | string | null | undefined, fallback: number): number =>
    v == null ? fallback : Number(v);
  const numOrDefault = <K extends keyof Globals>(
    v: number | string | null | undefined,
    key: K
  ): Globals[K] => {
    const base = BASELINE_GLOBALS[key];
    if (typeof base !== 'number') return base;
    return (v == null ? base : Number(v)) as Globals[K];
  };

  return {
    ...BASELINE_GLOBALS,
    interest_rate_apr: num(row.interest_rate_apr, BASELINE_GLOBALS.interest_rate_apr ?? 0),
    ltc_pct: num(row.ltc_pct, BASELINE_GLOBALS.ltc_pct ?? 0),
    ltc_land_pct: num(row.ltc_land_pct, BASELINE_GLOBALS.ltc_land_pct ?? 0),
    contingency_pct: num(row.contingency_pct, BASELINE_GLOBALS.contingency_pct ?? 0),
    default_build_cost_per_sqft: num(
      row.default_build_cost_per_sqft,
      BASELINE_GLOBALS.default_build_cost_per_sqft ?? 0
    ),
    default_kingshaus_cost_per_sqft: numOrDefault(
      row.default_kingshaus_cost_per_sqft,
      'default_kingshaus_cost_per_sqft'
    ),
    target_margin: num(row.target_margin, BASELINE_GLOBALS.target_margin ?? 0),
    default_program_months: num(row.default_program_months, BASELINE_GLOBALS.default_program_months ?? 12),
    model_start: row.model_start ?? BASELINE_GLOBALS.model_start ?? '2026-01',
    horizon_months: num(row.horizon_months, BASELINE_GLOBALS.horizon_months ?? 48),
    capitalize_interest:
      row.capitalize_interest == null
        ? BASELINE_GLOBALS.capitalize_interest
        : Boolean(row.capitalize_interest),
    financing_fees_per_project_usd: numOrDefault(
      row.financing_fees_per_project_usd,
      'financing_fees_per_project_usd'
    ),
    build_cost_curve:
      (row.build_cost_curve as Globals['build_cost_curve']) ?? BASELINE_GLOBALS.build_cost_curve,
    build_cost_realization_pct: numOrDefault(
      row.build_cost_realization_pct,
      'build_cost_realization_pct'
    ),
    risk_safe_ltc_pct: numOrDefault(row.risk_safe_ltc_pct, 'risk_safe_ltc_pct'),
    risk_sales_delay_grace_months: numOrDefault(
      row.risk_sales_delay_grace_months,
      'risk_sales_delay_grace_months'
    ),
    risk_cost_overrun_ratio: numOrDefault(
      row.risk_cost_overrun_ratio,
      'risk_cost_overrun_ratio'
    ),
    risk_equity_cluster_pctile: numOrDefault(
      row.risk_equity_cluster_pctile,
      'risk_equity_cluster_pctile'
    ),
    risk_sale_downside_haircut: numOrDefault(
      row.risk_sale_downside_haircut,
      'risk_sale_downside_haircut'
    ),
    annual_opex_usd: numOrDefault(row.annual_opex_usd, 'annual_opex_usd'),
    opex_growth_rate: numOrDefault(row.opex_growth_rate, 'opex_growth_rate'),
    apply_tax:
      row.apply_tax == null
        ? BASELINE_GLOBALS.apply_tax
        : Boolean(row.apply_tax),
    tax_rate_pct: numOrDefault(row.tax_rate_pct, 'tax_rate_pct'),
    tax_state_rate_pct: numOrDefault(row.tax_state_rate_pct, 'tax_state_rate_pct'),
    loss_carryforward:
      row.loss_carryforward == null
        ? BASELINE_GLOBALS.loss_carryforward
        : Boolean(row.loss_carryforward),
    include_sold_projects:
      row.include_sold_projects == null
        ? BASELINE_GLOBALS.include_sold_projects
        : Boolean(row.include_sold_projects),
    // V4.11c — markets: null OR empty array = fall back to baseline. An
    // editor-saved [] is treated as "I want zero markets" (degenerate but
    // explicit), distinguished from null ("use defaults").
    markets:
      row.markets == null
        ? BASELINE_GLOBALS.markets
        : (row.markets as Globals['markets']),
  };
}

function hasAnyOverride(row: GlobalsRow): boolean {
  return (
    row.interest_rate_apr != null ||
    row.ltc_pct != null ||
    row.ltc_land_pct != null ||
    row.contingency_pct != null ||
    row.default_build_cost_per_sqft != null ||
    row.default_kingshaus_cost_per_sqft != null ||
    row.target_margin != null ||
    row.default_program_months != null ||
    row.model_start != null ||
    row.horizon_months != null ||
    row.capitalize_interest != null ||
    row.financing_fees_per_project_usd != null ||
    row.build_cost_curve != null ||
    row.build_cost_realization_pct != null ||
    row.risk_safe_ltc_pct != null ||
    row.risk_sales_delay_grace_months != null ||
    row.risk_cost_overrun_ratio != null ||
    row.risk_equity_cluster_pctile != null ||
    row.risk_sale_downside_haircut != null ||
    row.annual_opex_usd != null ||
    row.opex_growth_rate != null ||
    row.apply_tax != null ||
    row.tax_rate_pct != null ||
    row.tax_state_rate_pct != null ||
    row.loss_carryforward != null ||
    row.include_sold_projects != null ||
    row.markets != null
  );
}
