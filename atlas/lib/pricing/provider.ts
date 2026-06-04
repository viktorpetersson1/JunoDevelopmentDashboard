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
 * Default is the documented 6 (Saunders in for Sound-front presence; StreetEasy
 * out — Manhattan-centric). Override at runtime via PRICING_COMP_DOMAINS
 * (comma-separated) with no code change.
 */
export const DEFAULT_COMP_DOMAINS = [
  'zillow.com',
  'redfin.com',
  'compass.com',
  'douglaselliman.com',
  'corcoran.com',
  'saunders.com',
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
