/**
 * V6.1.5 — pricing LLM provider flag (D-073, feature-flag option (b)).
 *
 * Until the Sonar path is verified end-to-end (T-PRC-3), the LIVE pricing path
 * stays on Anthropic. Setting `PRICING_LLM_PROVIDER=perplexity` flips the
 * pricing call sites to Sonar. Default is `anthropic`.
 *
 * This is the BUILD-WINDOW posture only. The shipped flag-on state has NO
 * Anthropic in the pricing path (Hard Rule #2). The flag exists so we can land
 * the adapter + Sonar wiring behind a default-off switch and flip it atomically
 * once the key is confirmed live and the 3 regression cases pass.
 *
 * NOTE: this is a "which provider" switch, NOT an on/off kill-switch — the
 * pricing page stays live on Anthropic while the flag is off (Gate 3 option (b),
 * not option (a) which would take the page offline during the swap window).
 */
export type PricingProvider = 'anthropic' | 'perplexity';

export function pricingProvider(): PricingProvider {
  // .trim() is load-bearing: CF Pages secrets set via `wrangler pages secret put`
  // with a piped value can carry a trailing newline ("perplexity\n"), which would
  // silently fail the `=== 'perplexity'` check and leave the path on Anthropic.
  return process.env.PRICING_LLM_PROVIDER?.trim() === 'perplexity' ? 'perplexity' : 'anthropic';
}

/** True once the pricing path is wired to Perplexity Sonar (T-PRC-3 flip). */
export function isSonarPricingEnabled(): boolean {
  return pricingProvider() === 'perplexity';
}

/**
 * Comp-search domain allow-list for Sonar `search_domain_filter` (Gate 2).
 *
 * Perplexity caps this at 20 domains (root domains auto-match subdomains).
 * The original 6 (zillow/redfin/compass/elliman/corcoran/saunders) structurally
 * EXCLUDED the dominant East End luxury-NC sources that the prompts themselves
 * name — Sotheby's, Bespoke, Out East — so Sonar could never search where the
 * best Hamptons comps actually live (V6.1.5-014, the "84 SBR research is thin"
 * report). Broadened to 11 targeted East End sources: 3 national aggregators
 * (authoritative closed/sold records) + the 8 brokerages/portals that carry
 * East End luxury NC inventory. Still well under the 20 cap, all on-topic
 * (the docs warn against diluting with off-topic domains, not against breadth).
 * Override at runtime via PRICING_COMP_DOMAINS (comma-separated), no code change.
 */
export const DEFAULT_COMP_DOMAINS = [
  // National aggregators — authoritative closed/sold sale records
  'zillow.com',
  'redfin.com',
  'realtor.com',
  // East End / Hamptons luxury brokerages (the dominant NC listing sources)
  'douglaselliman.com',
  'corcoran.com',
  'compass.com',
  'saunders.com',
  'sothebysrealty.com',
  'bespokerealestate.com',
  'bhsusa.com',
  // Hamptons-specific listings portal
  'outeast.com',
];

export function compSearchDomains(): string[] {
  const env = process.env.PRICING_COMP_DOMAINS;
  if (!env) return DEFAULT_COMP_DOMAINS;
  const parsed = env
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_COMP_DOMAINS;
}
