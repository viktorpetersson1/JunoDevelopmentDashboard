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

// StrategyBriefSchema       → added in T-PRC-3
// TriangulationBlockSchema  → added in T-PRC-4
// BuyerMigrationThesisSchema → added in T-PRC-5
