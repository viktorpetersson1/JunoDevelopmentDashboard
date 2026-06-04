/**
 * V6.1.5 — Perplexity Sonar response_format JSON schemas (D-066, D-070, Hard Rule #5).
 *
 * Sonar honours `response_format: { type: 'json_schema', json_schema: { name, schema } }`,
 * so the model returns guaranteed-shape JSON — no parsing JSON out of prose.
 *
 * These are raw JSON Schema objects (draft-07-ish), NOT Zod. The adapter
 * (`callPerplexity`) wraps the inner `schema` with the `json_schema` envelope,
 * using the call-site as the schema `name`. A Zod mirror lives in
 * `lib/pricing/schemas.ts` for defence-in-depth validation of the parsed result
 * (added in T-PRC-2) — Sonar guarantees the shape, Zod catches drift.
 *
 * Three call sites, three schemas:
 *   - CompResearchSchema       — T-PRC-1 (here; exercised by the adapter test) + T-PRC-2
 *   - StrategyBriefSchema      — T-PRC-3
 *   - TriangulationBlockSchema — T-PRC-4
 *   - BuyerMigrationThesisSchema — T-PRC-5
 */

/**
 * Comp research (comp-researcher.ts → `sonar-pro`). The inner JSON schema; the
 * adapter wraps it as `{ type: 'json_schema', json_schema: { name: 'comp_research', schema } }`.
 */
export const CompResearchSchema = {
  type: 'object',
  required: ['closed', 'active', 'sub_cut_definition', 'window_months', 'framework_notes'],
  properties: {
    sub_cut_definition: { type: 'string' }, // e.g. "Bayfront NC 4-5BR >= 4,500sqft"
    window_months: { type: 'integer' }, // 24 default, can stretch to 36
    closed: { type: 'array', items: { $ref: '#/$defs/Comp' } },
    active: { type: 'array', items: { $ref: '#/$defs/Comp' } },
    framework_notes: { type: 'string' }, // model's free text on data quality
    data_gap_severity: { type: 'string', enum: ['none', 'amber', 'red'] },
  },
  $defs: {
    Comp: {
      type: 'object',
      required: [
        'address',
        'status',
        'price_usd',
        'ag_sqft',
        'price_per_sqft',
        'attributes',
        'source_url',
      ],
      properties: {
        address: { type: 'string' },
        status: {
          type: 'string',
          enum: ['closed', 'active', 'contract', 'withdrawn', 'expired'],
        },
        price_usd: { type: 'number' },
        ag_sqft: { type: 'integer' },
        bg_sqft: { type: 'integer' },
        price_per_sqft: { type: 'number' },
        list_date: { type: 'string' }, // ISO
        sale_date: { type: 'string' }, // ISO or null
        dom_days: { type: 'integer' },
        relist_count: { type: 'integer' }, // T-PRC-6 stuck-listing tracker
        first_listed_at: { type: 'string' }, // T-PRC-6
        attributes: {
          type: 'object',
          properties: {
            construction: { type: 'string', enum: ['new', 'resale', 'reno'] },
            waterfront: { type: 'string', enum: ['sound', 'bay', 'ocean', 'none', 'creek'] },
            bedrooms: { type: 'integer' },
            pool: { type: 'boolean' },
            acreage: { type: 'number' },
          },
        },
        source_url: { type: 'string' }, // primary listing URL
      },
    },
  },
} as const;

/**
 * Strategy brief synthesis (strategy-brief.ts → `sonar-pro`, no web search).
 *
 * IMPORTANT (deviation V6.1.5-008): this mirrors the EXISTING `ParsedBriefBody`
 * shape (the AI-generated subset of `StrategyBrief`), NOT the plan's literal
 * StrategyBriefSchema field names (low/best/high, day0/60/120/180, bear/base/bull).
 * Reason: `generateStrategyBrief` already composes the brief from this shape +
 * deterministic breakevens + researched comps, then `reconcileMath` fixes the
 * arithmetic, and `insertBrief` + the render consume it. Mirroring the existing
 * shape keeps all of that untouched (option-b). The plan's NEW additions are
 * folded in: `recommendation.classification` (rider/maker) + `triangulation_block`
 * (populated by T-PRC-4). Breakevens + comp arrays are merged server-side, so
 * they are NOT in this schema.
 */
export const StrategyBriefSchema = {
  type: 'object',
  required: [
    'recommendation',
    'quickMath',
    'compEvidenceNarrative',
    'marketSentiment',
    'reductionLadder',
    'outcomeScenarios',
    'risks',
    'whyThisNumber',
    'finalRecommendation',
  ],
  properties: {
    recommendation: {
      type: 'object',
      required: ['launchPriceUsd', 'psfAtLaunch', 'oneLineThesis'],
      properties: {
        launchPriceUsd: { type: 'integer' },
        psfAtLaunch: { type: 'integer' },
        expectedMarginPct: { type: 'number' }, // margin at the ask (server recomputes)
        probWeightedMarginPct: { type: 'number' },
        oneLineThesis: { type: 'string' },
        // V6.1.5 — rider/maker classification (framework §3.3). New vs the Anthropic path.
        classification: {
          type: 'string',
          enum: ['rider', 'stretch_rider', 'market_maker', 'market_rider'],
        },
      },
    },
    quickMath: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          scenario: { type: 'string' },
          exitUsd: { type: 'integer' },
          psf: { type: 'integer' },
          netAfterClosingUsd: { type: 'integer' },
          profitUsd: { type: 'integer' },
          marginPct: { type: 'number' },
          read: { type: 'string' },
        },
      },
    },
    compEvidenceNarrative: { type: 'string' },
    marketSentiment: {
      type: 'object',
      properties: {
        indicators: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              indicator: { type: 'string' },
              reading: { type: 'string' },
              implication: { type: 'string' },
            },
          },
        },
        overallRead: { type: 'string' },
      },
    },
    reductionLadder: {
      type: 'object',
      properties: {
        phases: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' }, // Day 0 / 60 / 120 / 180
              priceUsd: { type: 'integer' },
              psf: { type: 'integer' },
              trigger: { type: 'string' },
              marginPct: { type: 'number' },
              action: { type: 'string' },
            },
          },
        },
        walkAwayFloor: {
          type: 'object',
          properties: {
            priceUsd: { type: 'integer' },
            psf: { type: 'integer' },
            marginPct: { type: 'number' },
            action: { type: 'string' },
          },
        },
      },
    },
    outcomeScenarios: {
      type: 'object',
      properties: {
        scenarios: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              exitUsd: { type: 'integer' },
              marginPct: { type: 'number' },
              probabilityPct: { type: 'number' },
            },
          },
        },
        probWeightedExpectedMarginPct: { type: 'number' },
        probWeightedExpectedExitUsd: { type: 'integer' },
      },
    },
    risks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          risk: { type: 'string' },
          impact: { type: 'string' },
          mitigation: { type: 'string' },
        },
      },
    },
    whyThisNumber: {
      type: 'object',
      properties: {
        headline: { type: 'string' },
        whyNotHigher: { type: 'array', items: { type: 'string' } },
        whyNotLower: { type: 'array', items: { type: 'string' } },
      },
    },
    finalRecommendation: {
      type: 'object',
      properties: {
        icFraming: { type: 'string' },
        nextSteps: { type: 'array', items: { type: 'string' } },
      },
    },
    // Populated by T-PRC-4 when data_gap_severity != 'none'; free-form here.
    triangulation_block: { type: 'object' },
  },
} as const;

/**
 * Location classifier (location-classifier.ts → `sonar-pro`). Uses the comps
 * waterfront vocabulary (sound_front_bluff/bayfront/inlet/inland) — NOT the
 * comp-research enum — because `parseLocationClassification` coerces against it.
 * lot_size_acres / year_built are nullable (the model returns null when it can't
 * verify the parcel). Only confidence + reasoning are required.
 */
export const LocationClassificationSchema = {
  type: 'object',
  required: ['confidence', 'reasoning'],
  properties: {
    waterfront_type: {
      type: 'string',
      enum: ['sound_front_bluff', 'bayfront', 'inlet', 'inland'],
    },
    view_premium: { type: 'string', enum: ['none', 'partial', 'full'] },
    town_proximity: { type: 'string', enum: ['walkable', 'short_drive', 'remote'] },
    lot_size_acres: { type: ['number', 'null'] },
    year_built: { type: ['integer', 'null'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    reasoning: { type: 'string' },
  },
} as const;

// TriangulationBlockSchema  → added in T-PRC-4
// BuyerMigrationThesisSchema → added in T-PRC-5
