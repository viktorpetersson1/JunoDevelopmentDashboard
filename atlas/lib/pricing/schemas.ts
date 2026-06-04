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

// ── V6.1.5 (T-PRC-3) — strategy brief synthesis (mirrors StrategyBriefSchema) ──
// Validates the Sonar brief-synthesis response before it is mapped into the
// existing ParsedBriefBody / StrategyBrief shape. Lenient (defaults on arrays +
// strings, optional margins) because reconcileMath recomputes the arithmetic
// server-side and breakevens/comps are merged in by generateStrategyBrief.

export const BriefClassificationSchema = z.enum([
  'rider',
  'stretch_rider',
  'market_maker',
  'market_rider',
]);

const BriefRecommendationSchema = z.object({
  launchPriceUsd: z.number(),
  psfAtLaunch: z.number(),
  expectedMarginPct: z.number().optional(),
  probWeightedMarginPct: z.number().optional(),
  oneLineThesis: z.string(),
  classification: BriefClassificationSchema.optional(),
});

const QuickMathRowSchema = z.object({
  scenario: z.string(),
  exitUsd: z.number(),
  psf: z.number(),
  netAfterClosingUsd: z.number().optional(),
  profitUsd: z.number().optional(),
  marginPct: z.number().optional(),
  read: z.string().optional(),
});

const MarketIndicatorSchema = z.object({
  indicator: z.string(),
  reading: z.string(),
  implication: z.string(),
});

const ReductionPhaseSchema = z.object({
  label: z.string(),
  priceUsd: z.number(),
  psf: z.number().optional(),
  trigger: z.string().optional(),
  marginPct: z.number().optional(),
  action: z.string().optional(),
});

const OutcomeScenarioSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  exitUsd: z.number(),
  marginPct: z.number().optional(),
  probabilityPct: z.number(),
});

const RiskItemSchema = z.object({
  risk: z.string(),
  impact: z.string().optional(),
  mitigation: z.string().optional(),
});

export const StrategyBriefBodySchema = z.object({
  recommendation: BriefRecommendationSchema,
  quickMath: z.array(QuickMathRowSchema).default([]),
  compEvidenceNarrative: z.string().default(''),
  marketSentiment: z
    .object({
      indicators: z.array(MarketIndicatorSchema).default([]),
      overallRead: z.string().default(''),
    })
    .default({ indicators: [], overallRead: '' }),
  reductionLadder: z
    .object({
      phases: z.array(ReductionPhaseSchema).default([]),
      walkAwayFloor: z
        .object({
          priceUsd: z.number().default(0),
          psf: z.number().default(0),
          marginPct: z.number().default(0),
          action: z.string().default(''),
        })
        .default({ priceUsd: 0, psf: 0, marginPct: 0, action: '' }),
    })
    .default({ phases: [], walkAwayFloor: { priceUsd: 0, psf: 0, marginPct: 0, action: '' } }),
  outcomeScenarios: z
    .object({
      scenarios: z.array(OutcomeScenarioSchema).default([]),
      probWeightedExpectedMarginPct: z.number().default(0),
      probWeightedExpectedExitUsd: z.number().default(0),
    })
    .default({ scenarios: [], probWeightedExpectedMarginPct: 0, probWeightedExpectedExitUsd: 0 }),
  risks: z.array(RiskItemSchema).default([]),
  whyThisNumber: z
    .object({
      headline: z.string().default(''),
      whyNotHigher: z.array(z.string()).default([]),
      whyNotLower: z.array(z.string()).default([]),
    })
    .default({ headline: '', whyNotHigher: [], whyNotLower: [] }),
  finalRecommendation: z
    .object({
      icFraming: z.string().default(''),
      nextSteps: z.array(z.string()).default([]),
    })
    .default({ icFraming: '', nextSteps: [] }),
  triangulation_block: z.unknown().optional(),
});

export type BriefClassification = z.infer<typeof BriefClassificationSchema>;
export type StrategyBriefBody = z.infer<typeof StrategyBriefBodySchema>;

// ── V6.1.5 (T-PRC-4) — triangulation block (mirrors TriangulationBlockSchema) ──

const TriangulationAnchorSchema = z.object({
  address: z.string(),
  price_per_sqft: z.number(),
  role: z.string().optional(),
  why_chosen: z.string().optional(),
});

export const TriangulationBlockDataSchema = z.object({
  in_sub_cut_closed_count: z.number().int(),
  in_sub_cut_active_count: z.number().int(),
  adjacent_sub_cut_closed_count: z.number().int().optional(),
  adjacent_sub_cut_definition: z.string().optional(),
  primary_anchor: TriangulationAnchorSchema.optional(),
  secondary_anchors: z.array(TriangulationAnchorSchema).default([]),
  derived_band: z
    .object({
      low: z.number().optional(),
      best: z.number().optional(),
      high: z.number().optional(),
      per_sqft_or_total: z.enum(['per_sqft', 'total']).optional(),
    })
    .default({}),
  band_derivation_logic: z.string(),
  gap_severity: z.enum(['amber', 'red']),
  unresolved_questions: z.array(z.string()).default([]),
});

export type TriangulationAnchor = z.infer<typeof TriangulationAnchorSchema>;
export type TriangulationBlock = z.infer<typeof TriangulationBlockDataSchema>;

// ── V6.1.5 (T-PRC-5) — buyer-migration thesis (mirrors BuyerMigrationThesisSchema) ──

const ThesisCompSchema = z.object({
  address: z.string(),
  price_per_sqft: z.number(),
  why: z.string().optional(),
});

export const BuyerMigrationThesisDataSchema = z.object({
  thesis_outcome: z.enum(['supported', 'rejected', 'inconclusive']),
  proposed_midpoint_per_sqft: z.number().optional(),
  adjacent_sub_cut_median_per_sqft: z.number().optional(),
  premium_vs_adjacent_pct: z.number().optional(),
  named_comps_supporting: z.array(ThesisCompSchema).default([]),
  named_comps_against: z.array(ThesisCompSchema).default([]),
  reasoning: z.string(),
  recommended_classification: z.enum(['stretch_rider', 'market_maker', 'rider']),
  walkback: z.string().optional(),
});

export type BuyerMigrationThesis = z.infer<typeof BuyerMigrationThesisDataSchema>;
