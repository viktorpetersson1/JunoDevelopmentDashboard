/**
 * V6.1.5 (T-PRC-5) — buyer-migration thesis (sonar-reasoning-pro).
 *
 * Fired by generateStrategyBrief when closed in-sub-cut < 3 (red gap) OR the
 * draft classification is market_maker. Tests whether the adjacent-sub-cut buyer
 * would realistically substitute at the proposed midpoint. The ONLY call that
 * uses sonar-reasoning-pro (chain-of-thought). 90s timeout (reasoning is slower).
 *
 * Fail-loud: on error returns { error } and the brief proceeds without a thesis
 * (no Anthropic fallback). A 'rejected' outcome lets the caller downshift a
 * Market-Maker classification to Stretch-Rider with the walkback midpoint —
 * a presentation gate, NOT a calc change (Hard Rule #1).
 *
 * NOTE (live-verify item): response_format on sonar-reasoning-pro is unverified
 * here (the live probe used sonar-pro). If the reasoning model wraps the JSON in
 * a <think> preamble, the adapter's JSON.parse fails → this returns { error } and
 * the brief proceeds without a thesis (graceful). Confirm on a live red-gap brief.
 */
import { callPerplexity, PerplexityError } from '@/lib/llm/perplexity-client';
import { BuyerMigrationThesisSchema } from '@/lib/llm/perplexity-schemas';
import { BuyerMigrationThesisDataSchema, type BuyerMigrationThesis } from './schemas';
import { SYSTEM_BASE_PROMPT, promptHash } from './prompts';
import { compSearchDomains } from './provider';
import type { ResearchedComp } from './comp-researcher';

export interface BuyerMigrationInput {
  subjectSummary: string;
  subCutDefinition: string;
  proposedMidpointPerSqft: number;
  closedComps: ResearchedComp[];
}

function compLine(c: ResearchedComp): string {
  const wf = c.waterfrontType ?? 'unknown';
  const nc = c.isNewConstruction ? 'NC' : 'resale';
  const psf = c.psf > 0 ? `$${Math.round(c.psf)}/sf` : 'psf n/a';
  return `- ${c.address} — ${nc}, ${wf}, ${psf} (${c.status})`;
}

export async function runBuyerMigrationThesis(
  input: BuyerMigrationInput,
  runId: string = crypto.randomUUID()
): Promise<{ thesis?: BuyerMigrationThesis; error?: string }> {
  const comps = input.closedComps.length ? input.closedComps.map(compLine).join('\n') : '(none)';
  const userPrompt = `Buyer-migration thesis test for an exit-pricing decision.

SUBJECT: ${input.subjectSummary}
SUB-CUT: ${input.subCutDefinition}
PROPOSED MIDPOINT: $${Math.round(input.proposedMidpointPerSqft).toLocaleString()}/sf

CLOSED comps (in-sub-cut may be thin; some may be an adjacent sub-cut):
${comps}

The subject sub-cut has fewer than 3 closed comps. Would the typical buyer of the ADJACENT sub-cut realistically substitute to this property at the proposed midpoint? Reason step by step, anchored to named closed comps:
- compute the adjacent-sub-cut median $/sf and the proposed midpoint's premium vs that median;
- name the closed comps that SUPPORT the substitution and those AGAINST it (by address, with $/sf);
- give a thesis_outcome: supported / rejected / inconclusive;
- recommend a classification (rider / stretch_rider / market_maker);
- if rejected, give a walkback: the midpoint that WOULD be supported.

Return only the buyer_migration_thesis JSON object.`;

  try {
    const hash = await promptHash(SYSTEM_BASE_PROMPT, 'buyer-migration-thesis-v1');
    const result = await callPerplexity<unknown>({
      systemPrompt: SYSTEM_BASE_PROMPT,
      userPrompt,
      model: 'sonar-reasoning-pro',
      responseSchema: BuyerMigrationThesisSchema,
      searchDomainFilter: compSearchDomains(),
      searchRecencyFilter: 'year',
      callSite: 'buyer_migration_thesis',
      runId,
      promptHash: hash,
      timeoutMs: 90_000,
    });
    const parsed = BuyerMigrationThesisDataSchema.safeParse(result.data);
    if (!parsed.success) {
      return {
        error: `Sonar buyer-migration thesis failed schema validation: ${parsed.error.issues[0]?.message ?? 'shape drift'}`,
      };
    }
    return { thesis: parsed.data };
  } catch (e) {
    const msg =
      e instanceof PerplexityError
        ? e.message
        : e instanceof Error
          ? e.message
          : 'Sonar buyer-migration thesis failed';
    return { error: msg };
  }
}
