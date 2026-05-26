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
  stage: z
    .enum(['sourcing', 'pre_construction', 'construction', 'sales', 'sold', 'archived'])
    .default('sourcing'),

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
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
