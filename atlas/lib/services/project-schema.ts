/**
 * Project create/update Zod schema — extracted from lib/services/project.ts
 * so client components (the New Project Wizard) can import the schema and
 * inferred type without pulling in next/headers + the Supabase server
 * client.
 *
 * This file is import-safe in both Server and Client Component contexts.
 * Server-only logic (createProject, repo calls) stays in project.ts.
 */

import { z } from 'zod';
import {
  WATERFRONT_TYPES,
  VIEW_PREMIUM_TYPES,
  TOWN_PROXIMITY_TYPES,
} from '@/lib/pricing/location-factors';

export const CreateProjectSchema = z.object({
  // Identity
  name: z.string().trim().min(1, 'Name is required').max(120),
  address: z.string().trim().max(200).optional().nullable(),
  entity_spv: z.string().trim().max(120).optional().nullable(),
  google_maps_url: z.string().url().optional().nullable(),

  // Taxonomy
  market_id: z.string().default('default'),
  asset_type: z.string().default('villa'),
  status: z.enum(['pipeline', 'committed']).default('pipeline'),
  // V6.1 T109: new projects land in 'tbc' by default until promoted to committed.
  stage: z
    .enum(['tbc', 'sourcing', 'pre_construction', 'construction', 'sales', 'sold', 'archived'])
    .default('tbc'),

  // Location factors (D-025b) — all optional; drive AI comp matching + brief.
  waterfront_type: z.enum(WATERFRONT_TYPES).optional().nullable(),
  view_premium: z.enum(VIEW_PREMIUM_TYPES).optional().nullable(),
  town_proximity: z.enum(TOWN_PROXIMITY_TYPES).optional().nullable(),
  lot_size_acres: z.number().nonnegative().max(1000).optional().nullable(),
  year_built: z.number().int().min(1800).max(2100).optional().nullable(),

  // Program (YYYY-MM)
  purchase_date: z.string().regex(/^\d{4}-\d{2}$/, 'purchase_date must be YYYY-MM'),

  // Sizing
  villa_sqft_ag: z.number().int().positive('Above-grade sqft must be > 0'),
  villa_sqft_bg: z.number().int().nonnegative().default(0),

  // Phases (months)
  sourcing_months: z.number().int().nonnegative().default(2),
  permitting_preconstruction_months: z.number().int().nonnegative().default(3),
  construction_months: z.number().int().positive('Construction must be ≥ 1 month'),
  sales_months: z.number().int().positive().default(3),

  // Costs (dollars — converted to cents at the boundary)
  land_cost_usd: z.number().positive('Land cost must be > 0'),
  build_cost_per_sqft: z.number().positive().optional().nullable(),
  soft_costs_lump_sum: z.number().nonnegative().default(0),

  // V5.2 T093.3 — per-project effective tax rate (%). Presentation-only (the
  // 9-line P&L applies it; engine global tax unchanged). Default 25.
  tax_rate_pct: z.number().min(0).max(60).default(25),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

// ────────────────────────────────────────────────────────────────────────────
// UpdateProjectSchema (V6.1 T104) — partial edit of an existing project.
//
// Every field is OPTIONAL: the Inputs editor modal sends the whole form, but
// T109's field-scoped PATCH reuse (Sales / Timeline tabs) sends a subset, so
// PATCH must accept partial payloads. Units mirror ProjectInput (dollars,
// decimals 0–1 for ltv/rate, % for tax) — the service converts to cents/bps.
//
// DELIBERATELY EXCLUDED (V6.1 stop-and-ask / drift register):
//   - kingshaus_cost_per_sqft  — in the ProjectInput TYPE but has NO
//     atlas.projects column (projectRowToInput never maps it; it's a
//     globals/baseline default). No persistence target → not editable here.
//   - ltc_pct                  — same: ProjectInput field, no project column.
// Adding columns + wiring them into projectRowToInput would feed the engine
// new per-project values and risk the golden master (Hard Rule #2). Surfaced
// to Viktor rather than fabricated. `start_date` is also omitted — it is a
// derived mirror of purchase_date (no column); editing purchase_date drives it.
// ─────────────────────────────────────────────────────────────────────────────
// CostBreakdown JSONB (V6.1 T107)
//
// Optional line-item breakdown per cost category. When present and non-empty,
// the UI shows it (and the Summary tab's 9-line P&L can expand to show
// itemized lines). The calc engine reads ONLY the lump-sum fields
// (build_cost_per_sqft, soft_costs_lump_sum, etc.) — never the breakdown —
// per Hard Rule #2 (engine untouched).
// ─────────────────────────────────────────────────────────────────────────────

const CostLineItemSchema = z.object({
  label: z.string().trim().min(1, 'Label required').max(80),
  amount_usd: z.number(), // sign convention: positive
  note: z.string().trim().max(200).optional(),
  status: z.enum(['estimate', 'committed', 'paid']).optional(),
});

export const CostBreakdownSchema = z.object({
  construction: z.array(CostLineItemSchema).optional(),
  superstructure: z.array(CostLineItemSchema).optional(),
  soft: z.array(CostLineItemSchema).optional(),
  financing: z.array(CostLineItemSchema).optional(),
});

export type CostLineItem = z.infer<typeof CostLineItemSchema>;
export type CostBreakdown = z.infer<typeof CostBreakdownSchema>;

export const UpdateProjectSchema = z
  .object({
    // Schedule
    purchase_date: z.string().regex(/^\d{4}-\d{2}$/, 'purchase_date must be YYYY-MM'),
    sourcing_months: z.number().int().min(0),
    permitting_preconstruction_months: z.number().int().min(0),
    construction_months: z.number().int().min(0),
    sales_months: z.number().int().min(0),
    // Villa
    villa_sqft_ag: z.number().int().positive('Above-grade sqft must be > 0'),
    villa_sqft_bg: z.number().int().min(0),
    // Costs (dollars)
    land_cost_usd: z.number().nonnegative(),
    build_cost_per_sqft: z.number().positive().nullable(),
    soft_costs_lump_sum: z.number().nonnegative(),
    // Financing (decimals 0–1)
    lender_name: z.string().trim().max(120).nullable(),
    // senior_ltv_bps is NOT NULL DEFAULT 7500 in the DB — never write null.
    senior_ltv_pct: z.number().min(0).max(1),
    interest_rate_apr: z.number().min(0).max(1).nullable(),
    // Targets
    sale_price_override_usd: z.number().nonnegative().nullable(),
    sale_price_per_sqft_override: z.number().nonnegative().nullable(),
    target_margin: z.number().min(0).max(2).nullable(),
    // Tax (%)
    tax_rate_pct: z.number().min(0).max(100),
    // Cost breakdown (V6.1 T107) — optional itemised breakdown per category.
    // Validated by Zod here; engine never reads it (Hard Rule #2).
    cost_breakdown: CostBreakdownSchema.nullable(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, {
    message: 'No fields to update — provide at least one field',
  });

export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;
