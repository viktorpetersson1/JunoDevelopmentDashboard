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
import {
  subjectLocationLines,
  LOCATION_PROMPT_GUIDANCE,
  type WaterfrontType,
  type ViewPremium,
  type TownProximity,
} from './location-factors';
// V6.1.5 (T-PRC-3) — Sonar brief synthesis (option-b dual-path)
import { callPerplexity, PerplexityError, type PerplexityCitation } from '@/lib/llm/perplexity-client';
import { StrategyBriefSchema } from '@/lib/llm/perplexity-schemas';
import {
  StrategyBriefBodySchema,
  type BriefClassification,
  type StrategyBriefBody,
  type TriangulationBlock,
  type BuyerMigrationThesis,
} from './schemas';
import { pricingProvider, type PricingProvider } from './provider';
import { SYSTEM_BASE_PROMPT, promptHash } from './prompts';
import { runTriangulation } from './triangulator';
import { runBuyerMigrationThesis } from './buyer-migration-thesis';

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
  // Location factors (D-025b)
  waterfrontType: WaterfrontType | null;
  viewPremium: ViewPremium | null;
  townProximity: TownProximity | null;
  /**
   * D-026(a) — pre-fetched library comps that the brief route has already
   * verified match the subject's sub-cut + waterfront + sqft. When non-empty,
   * the AI is told to use them as primary anchors and only web-search for
   * gaps. Pass an empty array (the default) to disable anchoring.
   */
  libraryAnchors?: ResearchedComp[];
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
    /** V6.1.5 rider/maker classification (framework §3.3). Sonar path only. */
    classification?: BriefClassification;
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

  /** V6.1.5 (T-PRC-4) — structured triangulation for data-gap cases. Sonar path only. */
  triangulationBlock?: TriangulationBlock;

  /** V6.1.5 (T-PRC-5) — buyer-migration thesis (sonar-reasoning-pro). Sonar path only. */
  buyerMigrationThesis?: BuyerMigrationThesis;
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
  /** V6.1.5 — top-level Sonar citations[] from the comp-research call (Hard Rule #6). */
  citations?: PerplexityCitation[];
  /** Which provider generated this brief ('anthropic' until the T-PRC-3 flip). */
  llmProvider?: PricingProvider;
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
    facts.landCostUsd +
    buildCost +
    facts.softCostsLumpSumUsd +
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
    margin10ExitUsd: exitForMargin(0.1),
    margin15ExitUsd: exitForMargin(0.15),
  };
}

function netAfterClosing(grossSale: number, cc: ClosingCostAssumptions): number {
  return Math.round(grossSale * (1 - cc.variablePct) - cc.fixedUsd);
}

/**
 * Deterministic math reconciliation.
 *
 * LLMs reliably get qualitative reasoning right but reliably get multi-step
 * arithmetic wrong (Claude is no exception). This pass:
 *
 *   - Trusts whatever exit prices and probabilities Claude chose.
 *   - Overrides every derived number (net-after-closing, profit, margin,
 *     probability-weighted exit and margin) with server-side math.
 *
 * Formula (single source of truth, matches breakeven solve above):
 *   netAfterCC  = gross × (1 − variablePct) − fixedUsd
 *   profit      = netAfterCC − totalDevCost
 *   marginPct   = profit / gross
 *
 * This is the *only* path that should compute margins from prices anywhere
 * in the engine.
 */
function reconcileMath(
  brief: StrategyBrief,
  totalDevCost: number,
  cc: ClosingCostAssumptions
): StrategyBrief {
  const round2 = (n: number) => Math.round(n * 10_000) / 10_000;

  function netCC(gross: number): number {
    return Math.round(gross * (1 - cc.variablePct) - cc.fixedUsd);
  }
  function profitOf(gross: number): number {
    return netCC(gross) - totalDevCost;
  }
  function marginOf(gross: number): number {
    if (gross <= 0) return 0;
    return round2(profitOf(gross) / gross);
  }
  function readFor(m: number): 'Loss' | 'Marginal' | 'Acceptable' | 'Strong' {
    if (m < 0) return 'Loss';
    if (m < 0.05) return 'Marginal';
    if (m < 0.15) return 'Acceptable';
    return 'Strong';
  }

  // Quick math — recompute net, profit, margin, read from exitUsd.
  const correctedQuickMath = brief.quickMath.map((row) => {
    const exit = row.exitUsd;
    const net = netCC(exit);
    const profit = net - totalDevCost;
    const margin = marginOf(exit);
    const psf = row.psf > 0 ? row.psf : Math.round(exit / Math.max(row.psf || 1, 1));
    return {
      ...row,
      psf,
      netAfterClosingUsd: net,
      profitUsd: Math.round(profit),
      marginPct: margin,
      read: readFor(margin),
    };
  });

  // Reduction ladder — recompute margin per phase + walk-away floor.
  const correctedPhases = brief.reductionLadder.phases.map((p) => ({
    ...p,
    marginPct: marginOf(p.priceUsd),
  }));
  const correctedFloor = {
    ...brief.reductionLadder.walkAwayFloor,
    marginPct: marginOf(brief.reductionLadder.walkAwayFloor.priceUsd),
  };

  // Outcome scenarios — recompute per-scenario margin.
  const correctedScenarios = brief.outcomeScenarios.scenarios.map((s) => ({
    ...s,
    marginPct: marginOf(s.exitUsd),
  }));

  // Probability-weighted expected exit + margin (normalize if probs don't
  // sum to exactly 100 — Claude sometimes drifts a bit).
  const totalProb = correctedScenarios.reduce((sum, s) => sum + (s.probabilityPct || 0), 0);
  let probWeightedExit = 0;
  if (totalProb > 0) {
    probWeightedExit = Math.round(
      correctedScenarios.reduce((sum, s) => sum + (s.probabilityPct / totalProb) * s.exitUsd, 0)
    );
  }
  const probWeightedMargin = probWeightedExit > 0 ? marginOf(probWeightedExit) : 0;

  // Recommendation — margin at ask from the launch price; prob-weighted
  // from the corrected scenarios.
  const correctedRecommendation = {
    ...brief.recommendation,
    expectedMarginPct: marginOf(brief.recommendation.launchPriceUsd),
    probWeightedMarginPct:
      correctedScenarios.length > 0
        ? probWeightedMargin
        : marginOf(brief.recommendation.launchPriceUsd),
  };

  return {
    ...brief,
    recommendation: correctedRecommendation,
    quickMath: correctedQuickMath,
    reductionLadder: {
      ...brief.reductionLadder,
      phases: correctedPhases,
      walkAwayFloor: correctedFloor,
    },
    outcomeScenarios: {
      scenarios: correctedScenarios,
      probWeightedExpectedMarginPct: probWeightedMargin,
      probWeightedExpectedExitUsd: probWeightedExit,
    },
  };
}

/**
 * Phase-aware framing instructions inserted into the brief prompt. The same
 * project at different phases needs different IC emphasis.
 */
function framingForPhase(phase: ProjectPhase): string {
  switch (phase) {
    case 'prospect':
      return [
        'The project is still pre-acquisition. The brief should explicitly answer: "should we acquire at the proposed land price?"',
        'Include an "acquisition price ceiling" recommendation in oneLineThesis or icFraming: the max land price at which base case clears 5% margin.',
        'Reduction ladder is hypothetical here — frame it as "if we acquire and built, this is the launch + ladder we would commit to".',
        'icFraming must include go / no-go recommendation.',
      ].join(' ');
    case 'precon':
      return [
        'Construction has not yet started. Brief should emphasize cost lock-in and design choices that drive the premium.',
        'Sensitivity to build-cost overrun matters: call out at what point a $/SF overrun kills the 5% margin floor.',
        'Reduction ladder is still 6–12 months away; treat it as planning guidance.',
      ].join(' ');
    case 'construction':
      return [
        'Build is in progress. Brief should focus on protecting the margin and preparing for listing launch.',
        'Highlight any cost actuals vs budget if visible; if not, emphasize disciplined cost control.',
        'Reduction ladder should anchor to expected listing date (typically 1–2 months after substantial completion).',
      ].join(' ');
    case 'sales':
      return [
        'Project is listed (or about to list). This brief is the playbook.',
        'Reduction ladder is the most important section: Day 0 / 60 / 120 / 180 with specific dollar triggers and DOM-based criteria.',
        'Outcome scenarios should be calibrated to actual market behavior over the next 6–12 months.',
        'icFraming should explicitly address: what to do if the first 60 days produce no qualified showings.',
      ].join(' ');
  }
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

  // D-026(a) — library anchors (when present) are emitted in their own block
  // so the model treats them as pre-verified and supplements via web search
  // only for gaps. They've already been filtered by sub-cut + waterfront +
  // sqft match in the brief route (findAnchorComps).
  const anchors = facts.libraryAnchors ?? [];
  const anchorsBlock =
    anchors.length === 0
      ? ''
      : `\n== LIBRARY ANCHORS (PRE-VERIFIED — USE AS PRIMARY) ==\n${anchors
          .map(
            (c) =>
              `- ${c.address} | ${c.status} | ${c.closingDate ?? '—'} | $${c.salePriceUsd.toLocaleString()} | ${c.agSqft.toLocaleString()} SF | $${Math.round(c.psf)}/SF | NC: ${c.isNewConstruction} | source: ${c.sourceName}`
          )
          .join(
            '\n'
          )}\n\nThese are existing Juno-library comps already matched to the subject's sub-cut, waterfront class, and sqft band. Treat them as primary anchors. The web-search comp list below is supplemental — use it to fill gaps (e.g. more recent closings or different sqft brackets) and to spot stuck listings, but do NOT re-discover or re-list addresses already in this anchor set.\n`;

  const phaseFraming = framingForPhase(facts.phase);
  const locationLines = subjectLocationLines({
    waterfrontType: facts.waterfrontType,
    viewPremium: facts.viewPremium,
    townProximity: facts.townProximity,
    lotSizeAcres: facts.lotSizeAcres,
    yearBuilt: facts.yearBuilt,
  });

  return `You are a senior investment committee analyst for Juno, a Hamptons / East End of Long Island residential developer. Produce an IC-grade pricing brief for the project below. Be honest, specific, and grounded in the comp evidence — IC framing is more valuable than optimism.

== MARKET CONTEXT (use this as anchor knowledge for the East End market) ==
The Hamptons and broader East End of Long Island is a high-end, seasonal, cash-dominated residential market. Key dynamics:
- $4M–$8M is the buyer-selective mid-luxury zone; >$5M for non-WF inventory clears slowly (12–24 months DOM is common).
- $/SF varies widely by sub-region: East Hampton Village + Sagaponack lead, Sag Harbor + Bridgehampton mid-tier, North Fork + Montauk lower band.
- Waterfront and water-view properties trade at 30-60% premium vs inland.
- New construction commands ~10–15% premium over comparable resales when design and brand are strong (think Kingshaus, Sean Murphy, Sandi Lefkowitz).
- Cash buyers dominate at $4M+; mortgage rates have limited price-elasticity impact at this level.
- The 30-yr mortgage rate is ~6.0–6.4% in 2026; cash dominance limits its impact at $4M+ price points.
- A "stuck listing" (relisted 2+ times, sitting 18+ months) is a strong signal that the ask exceeds market clearing — do not anchor a launch price to it.
- "Search-filter cliff" effects matter: $4.99M reaches a strictly wider buyer pool than $5.10M because of MLS / Zillow filter brackets.

== PROJECT ==
Name: ${facts.name}
Address: ${facts.address}
${facts.googleMapsUrl ? `Maps: ${facts.googleMapsUrl}\n` : ''}Sub-market: ${facts.subMarketLabel}
Above-grade SF: ${facts.villaSqftAg.toLocaleString()}
Below-grade SF: ${facts.villaSqftBg.toLocaleString()}
${locationLines ? locationLines + '\n' : ''}Construction type: ${facts.isNewConstruction ? 'New construction (Juno build)' : 'Resale'}
Current phase: ${facts.phase}

== LOCATION FACTORS ==
${LOCATION_PROMPT_GUIDANCE}

== PHASE FRAMING ==
${phaseFraming}

== COST STACK (deterministic; use these as-is) ==
Land cost: $${facts.landCostUsd.toLocaleString()}
Build cost: $${facts.buildCostPerSqftUsd}/SF × ${facts.villaSqftAg.toLocaleString()} SF = $${(facts.buildCostPerSqftUsd * facts.villaSqftAg).toLocaleString()}
Soft costs: $${facts.softCostsLumpSumUsd.toLocaleString()}
TOTAL DEV COST: $${breakevens.totalDevCostUsd.toLocaleString()}
Closing costs at sale: ${(cc.variablePct * 100).toFixed(1)}% variable (agent + transfer tax) + $${cc.fixedUsd.toLocaleString()} fixed (attorney + proration + title/misc)

== BREAKEVEN MATH (pre-computed; do NOT recompute, use these in quickMath rows) ==
Breakeven gross exit: $${breakevens.breakevenExitUsd.toLocaleString()} ($${breakevens.breakevenPsf}/SF)
5% margin exit: $${breakevens.margin5ExitUsd.toLocaleString()}
10% margin exit: $${breakevens.margin10ExitUsd.toLocaleString()}
15% margin exit: $${breakevens.margin15ExitUsd.toLocaleString()}

${anchorsBlock}== COMP EVIDENCE FROM WEB RESEARCH ==
${compsLines('CLOSED COMPS', closedComps)}

${compsLines('ACTIVE LISTINGS (CEILING)', activeComps)}

== HOW TO REASON ==
1. Start from the comp evidence, but FIRST filter to the subject's waterfront class (see LOCATION FACTORS). Use the SAME-class closed $/SF median + range as your defensible floor; use off-class comps only after adjusting their $/SF toward the subject's class, and never let a higher-class (e.g. bayfront) comp inflate an inland subject's median.
2. Layer the project's design premium: ~10–15% above comp median for genuine NC + design pedigree.
3. Stay below the stuck-ceiling: any listing that's been 18+ months at >breakeven is a warning sign.
4. Respect the $5M cliff in MLS filters; if your defensible range straddles it, anchor below.
5. Cross-check vs breakeven thresholds: launch ask must imply at least 5% margin to be defensible.
6. Build the reduction ladder so Day 180 still sits ≥ breakeven; below that, walk away and re-launch next cycle.
7. Weight scenarios honestly. If base case is breakeven, say so — better thin-margin truth than fantasy 15% margin.

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
- All prices in whole dollars (no cents).
- Outcome scenario probabilities MUST sum to 100.
- Use 4–6 risks. Each must have a concrete mitigation.
- Comp evidence narrative must reference the actual addresses from the comp list above.
- Be honest. If the deal is thin-margin or a loss, say so plainly in oneLineThesis and icFraming.
- NEVER fabricate market data — if you don't have a specific number for an indicator, omit that indicator rather than make one up.
- Output ONLY the JSON object. No markdown fences. No commentary.

ARITHMETIC NOTE:
For every field where you provide an exit price (recommendation.launchPriceUsd, quickMath.exitUsd, reductionLadder.phases[].priceUsd, outcomeScenarios.scenarios[].exitUsd, walkAwayFloor.priceUsd) the server WILL OVERRIDE your marginPct / netAfterClosingUsd / profitUsd values with a deterministic computation. So put your best-guess numbers in those fields but do not stress the arithmetic — focus on getting the prices and scenarios right. Probability values are kept as-is, margins are recomputed.`;
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

/**
 * Model fallback chain — matches comp-researcher.ts. Pinning to a specific
 * model id breaks the moment Anthropic deprecates it; -latest aliases plus a
 * candidate list make the engine self-healing across model upgrades.
 */
const MODEL_FALLBACK_CHAIN = [
  'claude-sonnet-4-5',
  'claude-3-7-sonnet-latest',
  'claude-3-5-sonnet-latest',
];

async function callClaudeForBrief(
  apiKey: string,
  prompt: string
): Promise<{ text: string; ok: boolean; status: number; modelUsed: string | null }> {
  let lastStatus = 0;
  for (const model of MODEL_FALLBACK_CHAIN) {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 6000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (resp.ok) {
      const data = (await resp.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text =
        data.content
          ?.filter(
            (c): c is { type: string; text: string } =>
              c.type === 'text' && typeof c.text === 'string'
          )
          .map((c) => c.text)
          .join('\n')
          .trim() ?? '';
      return { text, ok: true, status: resp.status, modelUsed: model };
    }

    lastStatus = resp.status;
    if (resp.status === 401 || resp.status === 403) break;
    if (resp.status !== 404) break;
  }
  return { text: '', ok: false, status: lastStatus, modelUsed: null };
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

  // V6.1.5 — one correlation id per brief run, shared by the comp-research +
  // brief-synthesis audit rows (pricing_llm_calls.run_id) on the Sonar path.
  const runId = crypto.randomUUID();
  const provider = pricingProvider();

  // 2. AI comp research.
  const compResearch = await researchComps(
    {
      address: facts.address,
      subCutLabel: facts.subMarketLabel,
      agSqft: facts.villaSqftAg,
      lotSizeAcres: facts.lotSizeAcres,
      yearBuilt: facts.yearBuilt,
      waterfrontType: facts.waterfrontType,
      viewPremium: facts.viewPremium,
      townProximity: facts.townProximity,
      isNc: facts.isNewConstruction,
      compWindowMonths: 18,
    },
    anthropicApiKey,
    { runId }
  );

  // D-026(a) — combine library anchors + fresh web research, deduping by
  // address so the AI doesn't double-count a comp it both saw in the anchor
  // block and re-discovered via search. Anchors win on conflict (they're
  // pre-verified against the comp library; AI results may drift).
  const libraryAnchors = facts.libraryAnchors ?? [];
  const anchorAddrs = new Set(libraryAnchors.map((a) => a.address.trim().toLowerCase()));
  const freshComps = compResearch.comps.filter(
    (c) => !anchorAddrs.has(c.address.trim().toLowerCase())
  );
  const closedComps = [
    ...libraryAnchors.filter((a) => a.status === 'closed'),
    ...freshComps.filter((c) => c.status === 'closed'),
  ];
  const activeComps = [
    ...libraryAnchors.filter((a) => a.status === 'active'),
    ...freshComps.filter((c) => c.status === 'active'),
  ];

  const closedPsfs = closedComps.map((c) => c.psf).sort((a, b) => a - b);
  const medianPsf =
    closedPsfs.length > 0 ? (closedPsfs[Math.floor(closedPsfs.length / 2)] ?? null) : null;
  const rangePsf =
    closedPsfs.length > 0
      ? {
          low: Math.round(closedPsfs[0] ?? 0),
          high: Math.round(closedPsfs[closedPsfs.length - 1] ?? 0),
        }
      : null;

  // 2b. V6.1.5 (T-PRC-4) — structured triangulation when comp research flags a
  // data gap (closed in-sub-cut < 3). Sonar reasoning call; failure is non-fatal
  // (block stays undefined, brief proceeds). Sonar path only.
  let triangulationBlock: TriangulationBlock | undefined;
  if (
    provider === 'perplexity' &&
    compResearch.dataGapSeverity &&
    compResearch.dataGapSeverity !== 'none'
  ) {
    const tri = await runTriangulation(
      {
        subjectSummary: `${facts.name} — ${facts.address}, ${facts.villaSqftAg.toLocaleString()} AG sqft, ${facts.isNewConstruction ? 'new construction' : 'resale'}`,
        subCutDefinition: compResearch.subCutDefinition ?? facts.subMarketLabel,
        gapSeverity: compResearch.dataGapSeverity,
        closedComps,
        activeComps,
      },
      runId
    );
    if (tri.block) triangulationBlock = tri.block;
  }

  // 3. Brief synthesis — Sonar (option-b flag) or the existing Anthropic call.
  const prompt = buildBriefPrompt(facts, closingCosts, breakevens, closedComps, activeComps);

  const fallback = (error: string): BriefGenerationResult => ({
    brief: {
      ...buildFallbackBrief(
        facts,
        closingCosts,
        breakevens,
        compResearch.comps,
        medianPsf,
        rangePsf,
        compResearch.narrativeSummary
      ),
      triangulationBlock,
    },
    usedWebSearch: compResearch.usedWebSearch,
    compCount: compResearch.comps.length,
    dataGap: compResearch.dataGap,
    error,
    citations: compResearch.citations,
    llmProvider: provider,
  });

  let parsed: ParsedBriefBody;
  if (provider === 'perplexity') {
    // Fail-loud: a Sonar error → deterministic fallback brief, never an Anthropic
    // retry (Hard Rule #2). The adapter already wrote a 'failed' audit row.
    const sonar = await callBriefViaSonar(prompt, runId);
    if (sonar.error || !sonar.parsed) {
      return fallback(sonar.error ?? 'Sonar brief synthesis returned no data');
    }
    parsed = sonar.parsed;
  } else {
    const { text, ok, status } = await callClaudeForBrief(anthropicApiKey, prompt);
    if (!ok || !text) return fallback(`Brief generation API error (HTTP ${status})`);
    try {
      parsed = JSON.parse(extractJson(text)) as ParsedBriefBody;
    } catch (err) {
      return fallback(`Brief JSON parse error: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  // 3b. V6.1.5 (T-PRC-5) — buyer-migration thesis on a red gap OR a draft
  // Market-Maker classification (sonar-reasoning-pro). A 'rejected' outcome
  // downshifts Market-Maker → Stretch-Rider (a presentation gate — the engine
  // math is untouched, Hard Rule #1).
  let buyerMigrationThesis: BuyerMigrationThesis | undefined;
  if (
    provider === 'perplexity' &&
    (compResearch.dataGapSeverity === 'red' ||
      parsed.recommendation.classification === 'market_maker')
  ) {
    const bmt = await runBuyerMigrationThesis(
      {
        subjectSummary: `${facts.name} — ${facts.address}, ${facts.villaSqftAg.toLocaleString()} AG sqft, ${facts.isNewConstruction ? 'new construction' : 'resale'}`,
        subCutDefinition: compResearch.subCutDefinition ?? facts.subMarketLabel,
        proposedMidpointPerSqft: parsed.recommendation.psfAtLaunch,
        closedComps,
      },
      runId
    );
    if (bmt.thesis) {
      buyerMigrationThesis = bmt.thesis;
      if (
        bmt.thesis.thesis_outcome === 'rejected' &&
        parsed.recommendation.classification === 'market_maker'
      ) {
        parsed.recommendation.classification = 'stretch_rider';
      }
    }
  }

  // 4. Compose final brief — merge AI output with deterministic sections.
  const briefBeforeReconcile: StrategyBrief = {
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
    triangulationBlock,
    buyerMigrationThesis,
  };

  // 5. Reconcile arithmetic. LLMs (Claude included) are unreliable on
  //    multi-step margin math — for any number where Claude gave us an exit
  //    price, we trust THAT and recompute net/profit/margin server-side.
  //    Eliminates the "$7.99M at 9% margin" class of bug.
  const brief = reconcileMath(briefBeforeReconcile, breakevens.totalDevCostUsd, closingCosts);

  return {
    brief,
    usedWebSearch: compResearch.usedWebSearch,
    compCount: compResearch.comps.length,
    dataGap: compResearch.dataGap,
    citations: compResearch.citations,
    llmProvider: provider,
  };

  // (intentional reference to make sure tree-shaker keeps the helper.)
  void netAfterClosing;
}

// ────────────────────────────────────────────────────────────────────────────
// V6.1.5 (T-PRC-3) — Sonar brief synthesis
//
// No web search on this call (the brief synthesizes; comp research already
// searched). Fail-loud: a Sonar error returns { error } and generateStrategyBrief
// falls back to the deterministic placeholder brief — it NEVER retries Anthropic
// (Hard Rule #2). The adapter already wrote a 'failed' pricing_llm_calls row.
// ────────────────────────────────────────────────────────────────────────────

async function callBriefViaSonar(
  prompt: string,
  runId: string
): Promise<{ parsed?: ParsedBriefBody; error?: string }> {
  try {
    const hash = await promptHash(SYSTEM_BASE_PROMPT, prompt);
    const result = await callPerplexity<unknown>({
      systemPrompt: SYSTEM_BASE_PROMPT,
      userPrompt: prompt,
      model: 'sonar-pro',
      responseSchema: StrategyBriefSchema,
      callSite: 'strategy_brief',
      runId,
      promptHash: hash,
    });
    const validated = StrategyBriefBodySchema.safeParse(result.data);
    if (!validated.success) {
      return {
        error: `Sonar brief failed schema validation: ${validated.error.issues[0]?.message ?? 'shape drift'}`,
      };
    }
    return { parsed: mapBriefBodyToParsed(validated.data) };
  } catch (e) {
    const msg =
      e instanceof PerplexityError
        ? e.message
        : e instanceof Error
          ? e.message
          : 'Sonar brief synthesis failed';
    return { error: msg };
  }
}

/**
 * Map the validated Sonar brief body → ParsedBriefBody. The shapes mirror each
 * other (StrategyBriefSchema mirrors ParsedBriefBody); this fills the optional
 * margin/text fields that reconcileMath overwrites anyway, so the composed
 * brief never carries undefined where the StrategyBrief type expects a value.
 */
function mapBriefBodyToParsed(body: StrategyBriefBody): ParsedBriefBody {
  return {
    recommendation: {
      launchPriceUsd: body.recommendation.launchPriceUsd,
      psfAtLaunch: body.recommendation.psfAtLaunch,
      expectedMarginPct: body.recommendation.expectedMarginPct ?? 0,
      probWeightedMarginPct: body.recommendation.probWeightedMarginPct ?? 0,
      oneLineThesis: body.recommendation.oneLineThesis,
      classification: body.recommendation.classification,
    },
    quickMath: body.quickMath.map((q) => ({
      scenario: q.scenario,
      exitUsd: q.exitUsd,
      psf: q.psf,
      netAfterClosingUsd: q.netAfterClosingUsd ?? 0,
      profitUsd: q.profitUsd ?? 0,
      marginPct: q.marginPct ?? 0,
      read: q.read ?? '',
    })),
    compEvidenceNarrative: body.compEvidenceNarrative,
    marketSentiment: body.marketSentiment,
    reductionLadder: {
      phases: body.reductionLadder.phases.map((p) => ({
        label: p.label,
        priceUsd: p.priceUsd,
        psf: p.psf ?? 0,
        trigger: p.trigger ?? '',
        marginPct: p.marginPct ?? 0,
        action: p.action ?? '',
      })),
      walkAwayFloor: body.reductionLadder.walkAwayFloor,
    },
    outcomeScenarios: {
      scenarios: body.outcomeScenarios.scenarios.map((s) => ({
        name: s.name,
        description: s.description ?? '',
        exitUsd: s.exitUsd,
        marginPct: s.marginPct ?? 0,
        probabilityPct: s.probabilityPct,
      })),
      probWeightedExpectedMarginPct: body.outcomeScenarios.probWeightedExpectedMarginPct,
      probWeightedExpectedExitUsd: body.outcomeScenarios.probWeightedExpectedExitUsd,
    },
    risks: body.risks.map((r) => ({
      risk: r.risk,
      impact: r.impact ?? '',
      mitigation: r.mitigation ?? '',
    })),
    whyThisNumber: body.whyThisNumber,
    finalRecommendation: body.finalRecommendation,
  };
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
      oneLineThesis:
        'AI brief generation unavailable — placeholder recommendation based on cost-stack breakeven + comp median.',
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
      nextSteps: [
        'Retry brief generation',
        'Verify ANTHROPIC_API_KEY is configured in Cloudflare Pages env vars',
      ],
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
  if (
    s.includes('sales') ||
    s.includes('listed') ||
    s.includes('marketing') ||
    s.includes('sold')
  ) {
    return 'sales';
  }
  // Default: construction (covers 'construction', 'building', 'completion', etc.)
  return 'construction';
}
