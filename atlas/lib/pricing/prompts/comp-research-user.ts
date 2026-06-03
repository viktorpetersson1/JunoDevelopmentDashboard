/**
 * V6.1.5 — comp-research user-message template (D-070, T-PRC-2).
 *
 * Placeholders use {{var}} (mustache-style) rather than the plan's ${var}
 * because ${} collides with JS template-literal interpolation in this .ts
 * module form (deviation V6.1.5-002). Rendered by renderTemplate() in
 * lib/pricing/prompts.ts. Recency + sources are constrained by the adapter's
 * search filters, NOT by prose here (§2.5).
 */
export const COMP_RESEARCH_USER_TEMPLATE = `Subject property for exit-pricing comp research:

- Address: {{address}}
- Above-grade sqft: {{ag_sqft}}
- Bedrooms: {{bedrooms}}
- Waterfront class: {{waterfront}}
- Sub-cut: {{sub_cut_definition}}

Assemble the comparable-sales evidence set for this sub-cut, applying the framework in the system prompt (P1 closed > active, P2 physical sub-cut, P3 NC primary).

- Window: closed sales within the last {{window_months}} months (recency and source scope are already constrained by the request filters — do not restate them).
- Return CLOSED comps first, then ACTIVE listings (the ceiling).
- Every comp needs a real, verifiable source_url to its primary listing. Do not invent comps or addresses.
- Tag each comp's attributes (construction, waterfront, bedrooms, pool, acreage) and provide price_per_sqft = price_usd / ag_sqft.
- Set sub_cut_definition to the exact physical bracket you priced against, and window_months to the window you used.
- If fewer than 3 closed in-sub-cut comps exist, set data_gap_severity to amber (thin) or red (zero / near-zero) — do NOT pad with off-class or fabricated comps.
- Populate relist_count, first_listed_at, and dom_days / current_dom_days where the listing history is available (stuck-listing signal).

Return only the comp_research JSON object.`;
