/**
 * D-025a — Pricing Strategy Brief generator.
 *
 * Produces a single structured brief per project that mirrors the
 * "Perplexity Pricing v5" format we already use manually. Replaces the
 * bottoms-up L/B/H comp-anchor UX with a top-down recommendation the
 * IC can read in one screen.
 *
 * Pipeline:
 *   1. Pull project facts (address, sqft, cost basis, phase, market).
 *   2. Compute breakeven + margin thresholds from cost stack.
 *   3. Run AI comp research (researchComps — web_search beta with fallback).
 *   4. Send Claude a SECOND call with the comps + facts + thresholds and
 *      ask for the full structured brief (recommendation, ladder, scenarios,
 *      risks, narrative) as a strict JSON document.
 *   5. Return a typed StrategyBrief.
 *
 * Persistence is handled by the caller (api route) via lib/repos/pricing-briefs.
 */

import { researchComps, type ResearchedComp } from './comp-researcher';

// ────────────────────────────────────────────────────────────────────────────
// Inputs
// ────────────────────────────────────────────────────────────────────────────

export type ProjectPhase = 'prospect' | 'precon' | 'construction' | 'sales';

export interface ProjectFactsForBrief {
  projectId: string;
  projectKey: string;
  name: string;
  address: string;
  googleMapsUrl: string | null;
  marketId: string;
  /** Sub-cut label for AI prompt — e.g. "Sag Harbor". */
  subMarketLabel: string;
  /** Whether the comp researcher should restrict to new-construction. */
  isNewConstruction: boolean;
  villaSqftAg: number;
  villaSqftBg: number;
  landCostUsd: number;
  buildCostPerSqftUsd: number;
  softCostsLumpSumUsd: number;
  closingCostsOverrideUsd: number | null;
  yearBuilt: number | null;
  lotSizeAcres: number | null;
  phase: ProjectPhase;
}

export interface ClosingCostAssumptions {
  variablePct: number;
  fixedUsd: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Output — the structured brief
// ────────────────────────────────────────────────────────────────────────────

export interface StrategyBrief {
  /** Section H — at-a-glance recommendation. */
  recommendation: {
    launchPriceUsd: number;
    psfAtLaunch: number;
    expectedMarginPct: number;
    probWeightedMarginPct: number;
    oneLineThesis: string;
  };

  /** Section 1 — derived from cost stack; not from AI. */
  breakevenThresholds: {
    totalDevCostUsd: number;
    breakevenExitUsd: number;
    breakevenPsf: number;
    margin5ExitUsd: number;
    margin10ExitUsd: number;
    margin15ExitUsd: number;
  };

  /** Section 1.5 — quick math table at 5 exit price points. */
  quickMath: QuickMathRow[];

  /** Section 2 — comps from researchComps + AI commentary. */
  compEvidence: {
    closedComps: ResearchedComp[];
    activeComps: ResearchedComp[];
    narrativeSummary: string;
    medianPsf: number | null;
    rangePsf: { low: number; high: number } | null;
    dataGap: boolean;
  };

  /** Section 3 — AI-generated current market read. */
  marketSentiment: {
    indicators: MarketIndicator[];
    overallRead: string;
  };

  /** Section 5 — pre-committed reduction triggers. */
  reductionLadder: {
    phases: ReductionPhase[];
    walkAwayFloor: {
      priceUsd: number;
      psf: number;
      marginPct: number;
      action: string;
    };
  };

  /** Section 6 — probability-weighted outcomes. */
  outcomeScenarios: {
    scenarios: OutcomeScenario[];
    probWeightedExpectedMarginPct: number;
    probWeightedExpectedExitUsd: number;
  };

  /** Section 7 — risks + mitigations. */
  risks: RiskItem[];

  /** Section 4 — "why this number, not higher, not lower". */
  whyThisNumber: {
    headline: string;
    whyNotHigher: string[];
    whyNotLower: string[];
  };

  /** Section 8 — IC framing + numbered next steps. */
  finalRecommendation: {
    icFraming: string;
    nextSteps: string[];
  };
}

export interface QuickMathRow {
  scenario: string;
  exitUsd: number;
  psf: number;
  netAfterClosingUsd: number;
  profitUsd: number;
  marginPct: number;
  read: string; // "Strong" | "Acceptable" | "Marginal" | "Loss"
}

export interface MarketIndicator {
  indicator: string;
  reading: string;
  implication: string;
}

export interface ReductionPhase {
  /** "Day 0" / "Day 60" / "Day 120" / "Day 180" */
  label: string;
  priceUsd: number;
  psf: number;
  trigger: string;
  marginPct: number;
  action: string;
}

export interface OutcomeScenario {
  name: string;
  description: string;
  exitUsd: number;
  marginPct: number;
  probabilityPct: number;
}

export interface RiskItem {
  risk: string;
  impact: string;
  mitigation: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Headline result envelope
// ────────────────────────────────────────────────────────────────────────────

export interface BriefGenerationResult {
  brief: StrategyBrief;
  usedWebSearch: boolean;
  compCount: number;
  dataGap: boolean;
  error?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Cost-stack math (deterministic; runs before any AI call)
// ────────────────────────────────────────────────────────────────────────────

function computeBreakevens(
  facts: ProjectFactsForBrief,
  closingCosts: ClosingCostAssumptions
): StrategyBrief['breakevenThresholds'] {
  const buildCost = facts.buildCostPerSqftUsd * facts.villaSqftAg;
  const totalDevCost =
    facts.landCostUsd + buildCost + facts.softCostsLumpSumUsd +
    (facts.closingCostsOverrideUsd ?? 0);

  // Solve for gross sale price G such that:
  //   margin = (G - G*v - fixed - totalDevCost) / G = m
  //   G*(1 - v - m) = fixed + totalDevCost
  //   G = (fixed + totalDevCost) / (1 - v - m)
  const v = closingCosts.variablePct;
  const fixed = closingCosts.fixedUsd;

  function exitForMargin(m: number): number {
    const denom = 1 - v - m;
    if (denom <= 0) return Number.POSITIVE_INFINITY;
    return Math.round((fixed + totalDevCost) / denom);
  }

  const breakevenExit = exitForMargin(0);

  return {
    totalDevCostUsd: Math.round(totalDevCost),
    breakevenExitUsd: breakevenExit,
    breakevenPsf: facts.villaSqftAg > 0 ? Math.round(breakevenExit / facts.villaSqftAg) : 0,
    margin5ExitUsd: exitForMargin(0.05),
    margin10ExitUsd: exitForMargin(0.10),
    margin15ExitUsd: exitForMargin(0.15),
  };
}

function netAfterClosing(grossSale: number, cc: ClosingCostAssumptions): number {
  return Math.round(grossSale * (1 - cc.variablePct) - cc.fixedUsd);
}

// ────────────────────────────────────────────────────────────────────────────
// AI call — full-brief structured prompt
// ────────────────────────────────────────────────────────────────────────────

function buildBriefPrompt(
  facts: ProjectFactsForBrief,
  cc: ClosingCostAssumptions,
  breakevens: StrategyBrief['breakevenThresholds'],
  closedComps: ResearchedComp[],
  activeComps: ResearchedComp[]
): string {
  const compsLines = (label: string, list: ResearchedComp[]) =>
    list.length === 0
      ? `${label}: NONE FOUND`
      : `${label}:\n` +
        list
          .map(
            (c) =>
              `- ${c.address} | ${c.status} | ${
                c.closingDate ?? 'active'
              } | $${c.salePriceUsd.toLocaleString()} | ${c.agSqft.toLocaleString()} SF | $${Math.round(c.psf)}/SF | NC: ${c.isNewConstruction} | source: ${c.sourceName}`
          )
          .join('\n');

  return `You are Juno's IC pricing analyst. Produce a Pricing Strategy Brief for the project below.

== PROJECT ==
Name: ${facts.name}
Address: ${facts.address}
Sub-market: ${facts.subMarketLabel}
Above-grade SF: ${facts.villaSqftAg.toLocaleString()}
Below-grade SF: ${facts.villaSqftBg.toLocaleString()}
${facts.lotSizeAcres ? `Lot: ${facts.lotSizeAcres} acres\n` : ''}${facts.yearBuilt ? `Year built: ${facts.yearBuilt}\n` : ''}New construction: ${facts.isNewConstruction}
Phase: ${facts.phase}

== COST STACK ==
Land cost: $${facts.landCostUsd.toLocaleString()}
Build cost: $${facts.buildCostPerSqftUsd}/SF × ${facts.villaSqftAg.toLocaleString()} SF = $${(facts.buildCostPerSqftUsd * facts.villaSqftAg).toLocaleString()}
Soft costs: $${facts.softCostsLumpSumUsd.toLocaleString()}
Total dev cost: $${breakevens.totalDevCostUsd.toLocaleString()}
Closing costs: ${(cc.variablePct * 100).toFixed(1)}% variable + $${cc.fixedUsd.toLocaleString()} fixed

== BREAKEVEN MATH (pre-computed; do not recompute) ==
Breakeven gross exit: $${breakevens.breakevenExitUsd.toLocaleString()} ($${breakevens.breakevenPsf}/SF)
5% margin exit: $${breakevens.margin5ExitUsd.toLocaleString()}
10% margin exit: $${breakevens.margin10ExitUsd.toLocaleString()}
15% margin exit: $${breakevens.margin15ExitUsd.toLocaleString()}

== COMP EVIDENCE ==
${compsLines('CLOSED COMPS', closedComps)}

${compsLines('ACTIVE LISTINGS (CEILING)', activeComps)}

== TASK ==
Produce a single JSON object. NO markdown, NO preamble, NO explanation text — ONLY a JSON object that exactly matches this shape:

{
  "recommendation": {
    "launchPriceUsd": <integer>,
    "psfAtLaunch": <integer>,
    "expectedMarginPct": <float, e.g. 0.025 for +2.5% — margin AT THE ASK PRICE>,
    "probWeightedMarginPct": <float, e.g. -0.009 — across all outcome scenarios weighted by probability>,
    "oneLineThesis": "<one sentence honest read, IC-grade>"
  },
  "quickMath": [
    { "scenario": "Bear / Loss", "exitUsd": <int>, "psf": <int>, "netAfterClosingUsd": <int>, "profitUsd": <int>, "marginPct": <float>, "read": "Loss" },
    { "scenario": "Base (comp midpoint)", "exitUsd": <int>, "psf": <int>, "netAfterClosingUsd": <int>, "profitUsd": <int>, "marginPct": <float>, "read": "Loss|Marginal|Acceptable" },
    { "scenario": "Recommended launch", "exitUsd": <int>, "psf": <int>, "netAfterClosingUsd": <int>, "profitUsd": <int>, "marginPct": <float>, "read": "Marginal|Acceptable|Strong" },
    { "scenario": "Stretch", "exitUsd": <int>, "psf": <int>, "netAfterClosingUsd": <int>, "profitUsd": <int>, "marginPct": <float>, "read": "Acceptable|Strong" },
    { "scenario": "Old base / ceiling", "exitUsd": <int>, "psf": <int>, "netAfterClosingUsd": <int>, "profitUsd": <int>, "marginPct": <float>, "read": "Strong" }
  ],
  "compEvidenceNarrative": "<2-3 sentence read of what the comps say>",
  "marketSentiment": {
    "indicators": [
      { "indicator": "Hamptons contracts YoY", "reading": "+12% units / +46% \\$ vol", "implication": "Bullish heading into summer" },
      { "indicator": "Shelter Island avg DOM", "reading": "137 days", "implication": "Pricing precision is critical" }
    ],
    "overallRead": "<one paragraph market context>"
  },
  "reductionLadder": {
    "phases": [
      { "label": "Day 0", "priceUsd": <int — same as launch>, "psf": <int>, "trigger": "Launch", "marginPct": <float>, "action": "Anchor on premium thesis. Test buyer pool." },
      { "label": "Day 60", "priceUsd": <int>, "psf": <int>, "trigger": "If <2 qualified showings or 0 written offers", "marginPct": <float>, "action": "<what to do>" },
      { "label": "Day 120", "priceUsd": <int>, "psf": <int>, "trigger": "<criteria>", "marginPct": <float>, "action": "<what to do>" },
      { "label": "Day 180", "priceUsd": <int>, "psf": <int>, "trigger": "<criteria>", "marginPct": <float>, "action": "<what to do>" }
    ],
    "walkAwayFloor": {
      "priceUsd": <int>,
      "psf": <int>,
      "marginPct": <float>,
      "action": "<what to do below this floor — typically rent and re-launch>"
    }
  },
  "outcomeScenarios": {
    "scenarios": [
      { "name": "Bull", "description": "<one sentence>", "exitUsd": <int>, "marginPct": <float>, "probabilityPct": 20 },
      { "name": "Strong base", "description": "<one sentence>", "exitUsd": <int>, "marginPct": <float>, "probabilityPct": 30 },
      { "name": "Base", "description": "<one sentence>", "exitUsd": <int>, "marginPct": <float>, "probabilityPct": 30 },
      { "name": "Bear", "description": "<one sentence>", "exitUsd": <int>, "marginPct": <float>, "probabilityPct": 15 },
      { "name": "Tail", "description": "Hold and re-launch next year", "exitUsd": <int>, "marginPct": <float>, "probabilityPct": 5 }
    ],
    "probWeightedExpectedMarginPct": <float>,
    "probWeightedExpectedExitUsd": <int>
  },
  "risks": [
    { "risk": "<risk>", "impact": "<impact>", "mitigation": "<mitigation>" }
  ],
  "whyThisNumber": {
    "headline": "<one sentence summary of the recommendation>",
    "whyNotHigher": ["<bullet 1>", "<bullet 2>", "<bullet 3>"],
    "whyNotLower": ["<bullet 1>", "<bullet 2>", "<bullet 3>"]
  },
  "finalRecommendation": {
    "icFraming": "<honest IC-grade paragraph: what this deal is, what it isn't, and why we are proceeding>",
    "nextSteps": [
      "Launch at $X end of <month>",
      "Pre-commit the reduction ladder",
      "Lock listing agent by <date>",
      "Marketing budget: $<range>",
      "Continue weekly monitoring of <specific comp(s)>"
    ]
  }
}

CRITICAL RULES:
- All margin percentages MUST be decimals (0.025 = 2.5%, not 2.5).
- All prices in whole dollars (no cents).
- Reduction ladder margins MUST be computed against the same cost basis and closing-cost model given above.
- Outcome scenario probabilities MUST sum to 100.
- probWeightedExpectedMarginPct = sum(p × margin) across all scenarios.
- Use 4–6 risks. Each must have a concrete mitigation.
- Comp evidence narrative must reference the actual addresses from the comp list above.
- Be honest. If the deal is thin-margin or a loss, say so plainly in oneLineThesis and icFraming.
- NEVER fabricate market data — if you don't have a specific number for an indicator, omit that indicator rather than make one up.
- Output ONLY the JSON object. No markdown fences. No commentary.`;
}

interface ParsedBriefBody {
  recommendation: StrategyBrief['recommendation'];
  quickMath: QuickMathRow[];
  compEvidenceNarrative: string;
  marketSentiment: StrategyBrief['marketSentiment'];
  reductionLadder: StrategyBrief['reductionLadder'];
  outcomeScenarios: StrategyBrief['outcomeScenarios'];
  risks: RiskItem[];
  whyThisNumber: StrategyBrief['whyThisNumber'];
  finalRecommendation: StrategyBrief['finalRecommendation'];
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  const obj = text.match(/\{[\s\S]*\}/);
  return obj ? obj[0] : text;
}

async function callClaudeForBrief(
  apiKey: string,
  prompt: string
): Promise<{ text: string; ok: boolean; status: number }> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 6000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    return { text: '', ok: false, status: resp.status };
  }

  const data = (await resp.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text =
    data.content
      ?.filter((c): c is { type: string; text: string } =>
        c.type === 'text' && typeof c.text === 'string'
      )
      .map((c) => c.text)
      .join('\n')
      .trim() ?? '';
  return { text, ok: true, status: resp.status };
}

// ────────────────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────────────────

export async function generateStrategyBrief(
  facts: ProjectFactsForBrief,
  closingCosts: ClosingCostAssumptions,
  anthropicApiKey: string
): Promise<BriefGenerationResult> {
  // 1. Deterministic breakeven math.
  const breakevens = computeBreakevens(facts, closingCosts);

  // 2. AI comp research.
  const compResearch = await researchComps(
    {
      address: facts.address,
      subCutLabel: facts.subMarketLabel,
      agSqft: facts.villaSqftAg,
      lotSizeAcres: facts.lotSizeAcres,
      yearBuilt: facts.yearBuilt,
      isNc: facts.isNewConstruction,
      compWindowMonths: 18,
    },
    anthropicApiKey
  );

  const closedComps = compResearch.comps.filter((c) => c.status === 'closed');
  const activeComps = compResearch.comps.filter((c) => c.status === 'active');

  const closedPsfs = closedComps.map((c) => c.psf).sort((a, b) => a - b);
  const medianPsf = closedPsfs.length > 0 ? closedPsfs[Math.floor(closedPsfs.length / 2)] ?? null : null;
  const rangePsf =
    closedPsfs.length > 0
      ? { low: Math.round(closedPsfs[0] ?? 0), high: Math.round(closedPsfs[closedPsfs.length - 1] ?? 0) }
      : null;

  // 3. Brief-generation Claude call.
  const prompt = buildBriefPrompt(facts, closingCosts, breakevens, closedComps, activeComps);
  const { text, ok, status } = await callClaudeForBrief(anthropicApiKey, prompt);

  if (!ok || !text) {
    return {
      brief: buildFallbackBrief(facts, closingCosts, breakevens, compResearch.comps, medianPsf, rangePsf, compResearch.narrativeSummary),
      usedWebSearch: compResearch.usedWebSearch,
      compCount: compResearch.comps.length,
      dataGap: compResearch.dataGap,
      error: `Brief generation API error (HTTP ${status})`,
    };
  }

  let parsed: ParsedBriefBody;
  try {
    parsed = JSON.parse(extractJson(text)) as ParsedBriefBody;
  } catch (err) {
    return {
      brief: buildFallbackBrief(facts, closingCosts, breakevens, compResearch.comps, medianPsf, rangePsf, compResearch.narrativeSummary),
      usedWebSearch: compResearch.usedWebSearch,
      compCount: compResearch.comps.length,
      dataGap: compResearch.dataGap,
      error: `Brief JSON parse error: ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }

  // 4. Compose final brief — merge AI output with deterministic sections.
  const brief: StrategyBrief = {
    recommendation: parsed.recommendation,
    breakevenThresholds: breakevens,
    quickMath: parsed.quickMath ?? [],
    compEvidence: {
      closedComps,
      activeComps,
      narrativeSummary: parsed.compEvidenceNarrative || compResearch.narrativeSummary,
      medianPsf,
      rangePsf,
      dataGap: compResearch.dataGap,
    },
    marketSentiment: parsed.marketSentiment ?? { indicators: [], overallRead: '' },
    reductionLadder: parsed.reductionLadder ?? {
      phases: [],
      walkAwayFloor: { priceUsd: 0, psf: 0, marginPct: 0, action: '' },
    },
    outcomeScenarios: parsed.outcomeScenarios ?? {
      scenarios: [],
      probWeightedExpectedMarginPct: 0,
      probWeightedExpectedExitUsd: 0,
    },
    risks: parsed.risks ?? [],
    whyThisNumber: parsed.whyThisNumber ?? { headline: '', whyNotHigher: [], whyNotLower: [] },
    finalRecommendation: parsed.finalRecommendation ?? { icFraming: '', nextSteps: [] },
  };

  return {
    brief,
    usedWebSearch: compResearch.usedWebSearch,
    compCount: compResearch.comps.length,
    dataGap: compResearch.dataGap,
  };

  // (intentional reference to make sure tree-shaker keeps the helper.)
  void netAfterClosing;
}

// ────────────────────────────────────────────────────────────────────────────
// Fallback brief — used when AI call fails. Pure deterministic placeholder.
// ────────────────────────────────────────────────────────────────────────────

function buildFallbackBrief(
  facts: ProjectFactsForBrief,
  cc: ClosingCostAssumptions,
  breakevens: StrategyBrief['breakevenThresholds'],
  comps: ResearchedComp[],
  medianPsf: number | null,
  rangePsf: { low: number; high: number } | null,
  compNarrative: string
): StrategyBrief {
  const launchPsf = medianPsf ?? Math.round(breakevens.breakevenPsf * 1.1);
  const launchPrice = Math.round(launchPsf * facts.villaSqftAg);
  const net = netAfterClosing(launchPrice, cc);
  const profit = net - breakevens.totalDevCostUsd;
  const margin = launchPrice > 0 ? profit / launchPrice : 0;

  return {
    recommendation: {
      launchPriceUsd: launchPrice,
      psfAtLaunch: launchPsf,
      expectedMarginPct: margin,
      probWeightedMarginPct: margin,
      oneLineThesis: 'AI brief generation unavailable — placeholder recommendation based on cost-stack breakeven + comp median.',
    },
    breakevenThresholds: breakevens,
    quickMath: [],
    compEvidence: {
      closedComps: comps.filter((c) => c.status === 'closed'),
      activeComps: comps.filter((c) => c.status === 'active'),
      narrativeSummary: compNarrative,
      medianPsf,
      rangePsf,
      dataGap: comps.filter((c) => c.status === 'closed').length < 3,
    },
    marketSentiment: { indicators: [], overallRead: 'Market sentiment unavailable.' },
    reductionLadder: {
      phases: [],
      walkAwayFloor: {
        priceUsd: breakevens.breakevenExitUsd,
        psf: breakevens.breakevenPsf,
        marginPct: 0,
        action: 'Hold below breakeven — do not sell at a loss.',
      },
    },
    outcomeScenarios: {
      scenarios: [],
      probWeightedExpectedMarginPct: margin,
      probWeightedExpectedExitUsd: launchPrice,
    },
    risks: [],
    whyThisNumber: { headline: '', whyNotHigher: [], whyNotLower: [] },
    finalRecommendation: {
      icFraming: 'Brief generation failed. Refresh once the AI service is available.',
      nextSteps: ['Retry brief generation', 'Verify ANTHROPIC_API_KEY is configured in Cloudflare Pages env vars'],
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Phase mapping helper
// ────────────────────────────────────────────────────────────────────────────

/**
 * Map a project's stage field to a brief phase. The project lifecycle has
 * more granular stages; the brief collapses them to 4.
 */
export function stageToPhase(stage: string | null | undefined): ProjectPhase {
  const s = (stage ?? '').toLowerCase();
  if (s.includes('source') || s.includes('prospect') || s.includes('acquisition')) {
    return 'prospect';
  }
  if (s.includes('permit') || s.includes('precon') || s.includes('design')) {
    return 'precon';
  }
  if (s.includes('sales') || s.includes('listed') || s.includes('marketing') || s.includes('sold')) {
    return 'sales';
  }
  // Default: construction (covers 'construction', 'building', 'completion', etc.)
  return 'construction';
}
