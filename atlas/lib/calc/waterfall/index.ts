/**
 * Barrel — owner-waterfall calc port.
 *
 * Keep imports narrow: callers should pull only the symbols they need
 * (`computeWaterfall`, `distributionWaterfall`, or the types) so unused
 * code tree-shakes cleanly into the edge bundle.
 */

export { computeWaterfall, equityCashFlowFromCalls, hypotheticalLpAnalysis } from './compute';
export { distributionWaterfall } from './distribution';
export type {
  InvestorWaterfallResult,
  WaterfallGlobals,
  WaterfallInvestorInput,
  WaterfallMonthlySeries,
  WaterfallTierBreakdown,
} from './types';
