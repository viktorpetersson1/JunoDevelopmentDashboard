/**
 * POST /api/pricing/research
 *
 * Stateless comp research + instant 5-stage pricing analysis.
 *
 * Flow:
 *   1. Validate input (address, sub-cut, property specs).
 *   2. Call AI comp researcher (Anthropic — web_search beta with fallback).
 *   3. Derive L/B/H PSF from the comp pool (percentile method).
 *   4. Run the 5-stage analysis:
 *        Stage 1 — Cost Stack (build cost from BASELINE_GLOBALS + optional land cost)
 *        Stage 2 — Comp Evidence  (the researched comps)
 *        Stage 3 — Exit Corridor  (L/B/H PSF → revenue)
 *        Stage 4 — Margin Model   (revenue vs cost at each scenario)
 *        Stage 5 — Probability Weighting (20/60/20 L/B/H → expected outcome)
 *   5. Return everything. No DB writes (caller saves comps separately).
 *
 * Auth: editor or super_admin (research consumes API credits).
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import {
  researchComps,
  type CompResearchOutput,
  type ResearchedComp,
} from '@/lib/pricing/comp-researcher';
import { BASELINE_GLOBALS } from '@/lib/calc/baselines';
import { bulkUpsertCompsIgnoreDupes, type NewCompInput } from '@/lib/repos/comps';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

// ────────────────────────────────────────────────────────────────────────────
// Input schema
// ────────────────────────────────────────────────────────────────────────────

const RequestSchema = z.object({
  address: z.string().min(1).max(500),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  subCutKey: z.string().min(1).max(100),
  subCutLabel: z.string().min(1).max(200),
  agSqft: z.number().int().positive().max(50_000),
  lotSizeAcres: z.number().nonnegative().max(1000).nullable().optional(),
  yearBuilt: z.number().int().min(1800).max(2100).nullable().optional(),
  isNc: z.boolean(),
  compWindowMonths: z.number().int().min(6).max(60).optional(),
  /** Optional land cost for the margin model (Stage 4). */
  landCostUsd: z.number().nonnegative().max(1_000_000_000).nullable().optional(),
});

// ────────────────────────────────────────────────────────────────────────────
// 5-stage analysis types
// ────────────────────────────────────────────────────────────────────────────

export interface CostStack {
  buildCostPerSqft: number;
  totalBuildCost: number;
  landCostUsd: number | null;
  /** build + land (land = 0 if not provided) */
  totalCostBasis: number;
}

export interface ExitCorridor {
  lowPsf: number | null;
  basePsf: number | null;
  highPsf: number | null;
  lowRevenue: number | null;
  baseRevenue: number | null;
  highRevenue: number | null;
}

export interface MarginModel {
  lowMarginPct: number | null;
  baseMarginPct: number | null;
  highMarginPct: number | null;
  lowProfit: number | null;
  baseProfit: number | null;
  highProfit: number | null;
}

export interface ProbabilityWeighting {
  /** 20/60/20 weighted expected revenue */
  weightedRevenue: number | null;
  weightedMarginPct: number | null;
  weightedProfit: number | null;
  lowWeight: number;
  baseWeight: number;
  highWeight: number;
}

export interface PricingAnalysis {
  costStack: CostStack;
  exitCorridor: ExitCorridor;
  marginModel: MarginModel;
  probabilityWeighting: ProbabilityWeighting;
}

// ────────────────────────────────────────────────────────────────────────────
// Analysis computation
// ────────────────────────────────────────────────────────────────────────────

function percentile(sortedArr: number[], pct: number): number {
  if (sortedArr.length === 0) return 0;
  const first = sortedArr[0];
  if (sortedArr.length === 1 || first === undefined) return first ?? 0;
  const idx = (pct / 100) * (sortedArr.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const loVal = sortedArr[lo] ?? 0;
  const hiVal = sortedArr[hi] ?? 0;
  if (lo === hi) return loVal;
  return loVal * (1 - (idx - lo)) + hiVal * (idx - lo);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computeAnalysis(
  comps: ResearchedComp[],
  agSqft: number,
  landCostUsd: number | null
): PricingAnalysis {
  // ── Stage 1: Cost Stack ──────────────────────────────────────────────────
  const buildCostPerSqft = BASELINE_GLOBALS.default_build_cost_per_sqft ?? 470;
  const totalBuildCost = Math.round(buildCostPerSqft * agSqft);
  const land = landCostUsd ?? null;
  const totalCostBasis = totalBuildCost + (land ?? 0);

  const costStack: CostStack = {
    buildCostPerSqft,
    totalBuildCost,
    landCostUsd: land,
    totalCostBasis,
  };

  // ── Stage 3: Exit Corridor from closed comp PSFs ─────────────────────────
  const closedPsfs = comps
    .filter((c) => c.status === 'closed' && c.psf > 0)
    .map((c) => c.psf)
    .sort((a, b) => a - b);

  const lowPsf = closedPsfs.length > 0 ? round2(percentile(closedPsfs, 10)) : null;
  const basePsf = closedPsfs.length > 0 ? round2(percentile(closedPsfs, 50)) : null;
  const highPsf = closedPsfs.length > 0 ? round2(percentile(closedPsfs, 90)) : null;

  const lowRevenue = lowPsf !== null ? Math.round(lowPsf * agSqft) : null;
  const baseRevenue = basePsf !== null ? Math.round(basePsf * agSqft) : null;
  const highRevenue = highPsf !== null ? Math.round(highPsf * agSqft) : null;

  const exitCorridor: ExitCorridor = {
    lowPsf,
    basePsf,
    highPsf,
    lowRevenue,
    baseRevenue,
    highRevenue,
  };

  // ── Stage 4: Margin Model ────────────────────────────────────────────────
  function margin(rev: number | null): number | null {
    if (rev === null || totalCostBasis <= 0) return null;
    return round2((rev - totalCostBasis) / rev);
  }
  function profit(rev: number | null): number | null {
    if (rev === null) return null;
    return Math.round(rev - totalCostBasis);
  }

  const marginModel: MarginModel = {
    lowMarginPct: margin(lowRevenue),
    baseMarginPct: margin(baseRevenue),
    highMarginPct: margin(highRevenue),
    lowProfit: profit(lowRevenue),
    baseProfit: profit(baseRevenue),
    highProfit: profit(highRevenue),
  };

  // ── Stage 5: Probability Weighting (20/60/20) ────────────────────────────
  const LOW_W = 0.2;
  const BASE_W = 0.6;
  const HIGH_W = 0.2;

  const weightedRevenue =
    lowRevenue !== null && baseRevenue !== null && highRevenue !== null
      ? Math.round(LOW_W * lowRevenue + BASE_W * baseRevenue + HIGH_W * highRevenue)
      : null;

  const probabilityWeighting: ProbabilityWeighting = {
    weightedRevenue,
    weightedMarginPct: margin(weightedRevenue),
    weightedProfit: profit(weightedRevenue),
    lowWeight: LOW_W,
    baseWeight: BASE_W,
    highWeight: HIGH_W,
  };

  return { costStack, exitCorridor, marginModel, probabilityWeighting };
}

// ────────────────────────────────────────────────────────────────────────────
// Handler
// ────────────────────────────────────────────────────────────────────────────

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const { profile } = await requireAuth();
  requireEditor(profile);

  const json = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }

  const {
    address,
    lat,
    lng,
    subCutKey,
    subCutLabel,
    agSqft,
    lotSizeAcres,
    yearBuilt,
    isNc,
    compWindowMonths,
    landCostUsd,
  } = parsed.data;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return badRequest(
      'ANTHROPIC_API_KEY is not configured — comp research unavailable.',
      'NO_API_KEY'
    );
  }

  const research: CompResearchOutput = await researchComps(
    { address, subCutLabel, agSqft, lotSizeAcres, yearBuilt, isNc, compWindowMonths },
    apiKey
  );

  // D-026: auto-save AI-researched comps to library (same logic as brief flow).
  const compsToSave: NewCompInput[] = research.comps
    .filter((c) => c.address && c.agSqft > 0 && c.salePriceUsd > 0)
    .map((c) => ({
      address: c.address,
      subCutKey,
      isNc: c.isNewConstruction,
      status: c.status,
      closingDate: c.closingDate,
      salePriceCents: Math.round(c.salePriceUsd * 100),
      agSqft: c.agSqft,
      lotSizeAcres: c.lotSizeAcres ?? null,
      yearBuilt: c.yearBuilt ?? null,
      domDays: c.domDays ?? null,
      sourceUrl: c.sourceUrl,
      source: 'other' as const,
      notes: `Auto-saved from Quick Price — ${c.sourceName}${c.confidence === 'estimated' ? ' (AI-estimated)' : ''}`,
    }));
  if (compsToSave.length > 0) {
    void bulkUpsertCompsIgnoreDupes(compsToSave).catch(() => {
      // best-effort
    });
  }

  const analysis = computeAnalysis(research.comps, agSqft, landCostUsd ?? null);

  return ok({
    address,
    lat: lat ?? null,
    lng: lng ?? null,
    subCutKey,
    subCutLabel,
    agSqft,
    isNc,
    research,
    analysis,
  });
});
