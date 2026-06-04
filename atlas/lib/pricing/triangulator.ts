/**
 * V6.1.5 (T-PRC-4) — structured triangulation block.
 *
 * Fired by generateStrategyBrief when comp research returns
 * data_gap_severity != 'none' (closed in-sub-cut < 3). A second sonar-pro call
 * reasons over the comp sets + subject and returns a structured block: which
 * anchors, the adjacent sub-cut, the derived band, and the unresolved questions
 * surfaced for partner (human) reconciliation.
 *
 * Fail-loud: on a Sonar error or schema miss, returns { error } and the brief
 * proceeds WITHOUT a triangulation block — never an Anthropic fallback (Hard
 * Rule #2). The adapter already wrote a 'failed' pricing_llm_calls row.
 *
 * Audit call_site = 'comp_research' (deviation V6.1.5-011): the pricing_llm_calls
 * CHECK enum has no 'triangulation' value and the migration budget is 0036/0037
 * only, so this comp-side band-derivation call logs under comp_research.
 */
import { callPerplexity, PerplexityError } from '@/lib/llm/perplexity-client';
import { TriangulationBlockSchema } from '@/lib/llm/perplexity-schemas';
import { TriangulationBlockDataSchema, type TriangulationBlock } from './schemas';
import { SYSTEM_BASE_PROMPT, promptHash } from './prompts';
import { compSearchDomains } from './provider';
import type { ResearchedComp } from './comp-researcher';

export interface TriangulationInput {
  subjectSummary: string;
  subCutDefinition: string;
  gapSeverity: 'amber' | 'red';
  closedComps: ResearchedComp[];
  activeComps: ResearchedComp[];
}

function compLine(c: ResearchedComp): string {
  const wf = c.waterfrontType ?? 'unknown';
  const nc = c.isNewConstruction ? 'NC' : 'resale';
  const psf = c.psf > 0 ? `$${Math.round(c.psf)}/sf` : 'psf n/a';
  return `- ${c.address} — ${nc}, ${wf}, ${c.agSqft.toLocaleString()} AG sqft, ${psf} (${c.status})`;
}

export async function runTriangulation(
  input: TriangulationInput,
  runId: string = crypto.randomUUID()
): Promise<{ block?: TriangulationBlock; error?: string }> {
  const closed = input.closedComps.length ? input.closedComps.map(compLine).join('\n') : '(none)';
  const active = input.activeComps.length ? input.activeComps.map(compLine).join('\n') : '(none)';

  const userPrompt = `Data-gap triangulation for an exit-pricing decision.

SUBJECT: ${input.subjectSummary}
SUB-CUT: ${input.subCutDefinition}
GAP SEVERITY: ${input.gapSeverity} (closed in-sub-cut comps are thin)

CLOSED comps found:
${closed}

ACTIVE comps found:
${active}

Apply the framework (P1 closed > active, P2 physical sub-cut, P3 NC primary). Determine:
- how many of the CLOSED comps are truly in-sub-cut vs an adjacent sub-cut, and define the adjacent sub-cut you leaned on;
- the primary anchor (a named closed comp, by address) and 1-3 secondary anchors, each with the role it plays and why you chose it;
- a derived band (low / best / high) anchored to those named comps, stating whether the band is per_sqft or total;
- the band derivation logic in one paragraph;
- the unresolved questions a partner must reconcile before committing.

Return only the triangulation_block JSON object.`;

  try {
    const hash = await promptHash(SYSTEM_BASE_PROMPT, 'triangulation-v1');
    const result = await callPerplexity<unknown>({
      systemPrompt: SYSTEM_BASE_PROMPT,
      userPrompt,
      model: 'sonar-pro',
      responseSchema: TriangulationBlockSchema,
      searchDomainFilter: compSearchDomains(),
      callSite: 'comp_research',
      runId,
      promptHash: hash,
    });
    const parsed = TriangulationBlockDataSchema.safeParse(result.data);
    if (!parsed.success) {
      return {
        error: `Sonar triangulation failed schema validation: ${parsed.error.issues[0]?.message ?? 'shape drift'}`,
      };
    }
    return { block: parsed.data };
  } catch (e) {
    const msg =
      e instanceof PerplexityError
        ? e.message
        : e instanceof Error
          ? e.message
          : 'Sonar triangulation failed';
    return { error: msg };
  }
}
