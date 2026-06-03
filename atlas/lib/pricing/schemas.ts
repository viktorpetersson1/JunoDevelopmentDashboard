/**
 * V6.1.5 — Zod mirrors of the Perplexity response schemas (T-PRC-2).
 *
 * Sonar guarantees the JSON shape via response_format (Hard Rule #5), but we
 * re-validate the parsed result with Zod for defence-in-depth — it catches
 * provider drift and gives a typed object to map from. On a validation miss the
 * caller treats it as a failed run (fail-loud), never silently coerces.
 *
 * Mirrors CompResearchSchema in lib/llm/perplexity-schemas.ts. Lenient where the
 * JSON schema marks a field optional; strict on the required identity fields.
 */
import { z } from 'zod';

export const SonarCompAttributesSchema = z
  .object({
    construction: z.enum(['new', 'resale', 'reno']).optional(),
    waterfront: z.enum(['sound', 'bay', 'ocean', 'none', 'creek']).optional(),
    bedrooms: z.number().int().optional(),
    pool: z.boolean().optional(),
    acreage: z.number().optional(),
  })
  .partial();

export const SonarCompSchema = z.object({
  address: z.string().min(1),
  status: z.enum(['closed', 'active', 'contract', 'withdrawn', 'expired']),
  price_usd: z.number(),
  ag_sqft: z.number().int(),
  bg_sqft: z.number().int().optional(),
  price_per_sqft: z.number(),
  list_date: z.string().optional(),
  sale_date: z.string().optional(),
  dom_days: z.number().int().optional(),
  relist_count: z.number().int().optional(),
  first_listed_at: z.string().optional(),
  attributes: SonarCompAttributesSchema.optional(),
  source_url: z.string(),
});

export const CompResearchDataSchema = z.object({
  sub_cut_definition: z.string(),
  window_months: z.number().int(),
  closed: z.array(SonarCompSchema),
  active: z.array(SonarCompSchema),
  framework_notes: z.string(),
  data_gap_severity: z.enum(['none', 'amber', 'red']).optional(),
});

export type SonarComp = z.infer<typeof SonarCompSchema>;
export type SonarWaterfront = NonNullable<z.infer<typeof SonarCompAttributesSchema>['waterfront']>;
export type CompResearchData = z.infer<typeof CompResearchDataSchema>;
