/**
 * V7 T138 — simple create form: pure payload builders.
 *
 * The one-form create maps ~14 visible inputs onto the EXISTING API
 * contracts — no new server surface:
 *   1. POST /api/projects            (CreateProjectSchema — unchanged)
 *   2. optional PATCH /api/projects/[key] (UpdateProjectSchema — unchanged)
 *      for the two knobs the create schema doesn't carry: target sale price
 *      and the "KPC LOC only" financing preset (senior_ltv_pct = 0).
 *
 * Everything else inherits globals and is editable later via the T136
 * edit-assumptions drawer.
 */

import type { CreateProjectInput } from '@/lib/services/project-schema';

export interface SimpleFormState {
  name: string;
  market_id: string;
  stage: 'tbc' | 'sourcing' | 'pre_construction' | 'construction' | 'sales';
  purchase_date: string; // YYYY-MM
  villa_sqft_ag: string;
  villa_sqft_bg: string;
  land_cost_usd: string;
  /** Blank = inherit the global default $/sqft. */
  build_cost_per_sqft: string;
  /** Blank = engine-derived (target margin / market $/sqft). */
  target_sale_price_usd: string;
  sourcing_months: string;
  permitting_months: string;
  construction_months: string;
  sales_months: string;
  /** 'senior_plus_loc' keeps the 75% senior default; 'kpc_only' zeroes it. */
  financing: 'senior_plus_loc' | 'kpc_only';
}

export function defaultFormState(todayYM: string): SimpleFormState {
  return {
    name: '',
    market_id: 'default',
    stage: 'tbc',
    purchase_date: todayYM,
    villa_sqft_ag: '',
    villa_sqft_bg: '0',
    land_cost_usd: '',
    build_cost_per_sqft: '',
    target_sale_price_usd: '',
    sourcing_months: '2',
    permitting_months: '3',
    construction_months: '14',
    sales_months: '3',
    financing: 'senior_plus_loc',
  };
}

const num = (s: string): number | null => {
  const n = Number(s.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && s.trim() !== '' ? n : null;
};

export interface BuiltPayloads {
  create: CreateProjectInput;
  /** Null when no follow-up PATCH is needed. */
  patch: { sale_price_override_usd?: number; senior_ltv_pct?: number } | null;
  errors: string[];
}

/** Map the form onto the two API payloads; collect human-readable errors. */
export function buildPayloads(form: SimpleFormState): BuiltPayloads {
  const errors: string[] = [];
  const ag = num(form.villa_sqft_ag);
  const bg = num(form.villa_sqft_bg) ?? 0;
  const land = num(form.land_cost_usd);
  const build = num(form.build_cost_per_sqft);
  const target = num(form.target_sale_price_usd);
  const sourcing = num(form.sourcing_months) ?? 2;
  const permitting = num(form.permitting_months) ?? 3;
  const construction = num(form.construction_months);
  const sales = num(form.sales_months) ?? 3;

  if (!form.name.trim()) errors.push('Name is required.');
  if (!/^\d{4}-\d{2}$/.test(form.purchase_date)) errors.push('Purchase month must be YYYY-MM.');
  if (!ag || ag <= 0) errors.push('Above-grade sqft must be > 0.');
  if (!land || land <= 0) errors.push('Land cost must be > 0.');
  if (!construction || construction <= 0) errors.push('Construction months must be ≥ 1.');
  if (build !== null && build <= 0) errors.push('Build $/sqft must be > 0 when set.');
  if (target !== null && target <= 0) errors.push('Target sale price must be > 0 when set.');

  const create: CreateProjectInput = {
    name: form.name.trim(),
    market_id: form.market_id,
    asset_type: 'villa',
    status: 'pipeline',
    stage: form.stage,
    purchase_date: form.purchase_date,
    villa_sqft_ag: Math.round(ag ?? 0),
    villa_sqft_bg: Math.round(bg),
    sourcing_months: Math.round(sourcing),
    permitting_preconstruction_months: Math.round(permitting),
    construction_months: Math.round(construction ?? 0),
    sales_months: Math.round(sales),
    land_cost_usd: land ?? 0,
    build_cost_per_sqft: build, // null = inherit global default
    soft_costs_lump_sum: 0,
    tax_rate_pct: 25,
  };

  const patch: NonNullable<BuiltPayloads['patch']> = {};
  if (target !== null) patch.sale_price_override_usd = target;
  if (form.financing === 'kpc_only') patch.senior_ltv_pct = 0;

  return {
    create,
    patch: Object.keys(patch).length > 0 ? patch : null,
    errors,
  };
}

/** The number of visible inputs on the form — asserted < 15 (T138). */
export const VISIBLE_INPUT_COUNT = 14;
