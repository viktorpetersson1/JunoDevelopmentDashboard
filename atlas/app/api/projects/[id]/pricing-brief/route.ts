/**
 * GET  /api/projects/[id]/pricing-brief
 *   List briefs for a project (newest first). Authenticated users.
 *
 * POST /api/projects/[id]/pricing-brief
 *   Generate a new strategy brief (vN+1). Editor or super_admin only.
 *   ~15-25 second runtime (calls Anthropic twice — comp research + brief).
 *
 * Param [id] is the project_key (slug); resolved to uuid server-side.
 */

import type { NextRequest } from 'next/server';
import { ok, created, badRequest, notFound } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import {
  findCurrentProjectByKey,
  findCurrentProjectUuidByKey,
} from '@/lib/repos/project';
import { listBriefs, insertBrief } from '@/lib/repos/pricing-briefs';
import { bulkUpsertCompsIgnoreDupes, type NewCompInput } from '@/lib/repos/comps';
import { getActiveGlobals } from '@/lib/globals/active';
import {
  generateStrategyBrief,
  stageToPhase,
  type ProjectFactsForBrief,
} from '@/lib/pricing/strategy-brief';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

// ────────────────────────────────────────────────────────────────────────────
// GET — list briefs for the project
// ────────────────────────────────────────────────────────────────────────────

export const GET = withErrorBoundary(async (_req: NextRequest, ctx: RouteContext) => {
  await requireAuth();
  const uuid = await findCurrentProjectUuidByKey(ctx.params.id);
  if (!uuid) return notFound(`Project "${ctx.params.id}" not found`, 'PROJECT_NOT_FOUND');
  const briefs = await listBriefs(uuid);
  return ok({ briefs });
});

// ────────────────────────────────────────────────────────────────────────────
// POST — generate vN+1
// ────────────────────────────────────────────────────────────────────────────

export const POST = withErrorBoundary(async (_req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const project = await findCurrentProjectByKey(ctx.params.id);
  if (!project) return notFound(`Project "${ctx.params.id}" not found`, 'PROJECT_NOT_FOUND');
  const uuid = await findCurrentProjectUuidByKey(ctx.params.id);
  if (!uuid) return notFound(`Project "${ctx.params.id}" not found`, 'PROJECT_NOT_FOUND');

  if (!project.address || !project.villa_sqft_ag || project.villa_sqft_ag <= 0) {
    return badRequest(
      'Project needs an address + above-grade SF before a brief can be generated.',
      'PROJECT_MISSING_FIELDS'
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return badRequest(
      'ANTHROPIC_API_KEY not configured — brief generation unavailable.',
      'NO_API_KEY'
    );
  }

  const globalsCtx = await getActiveGlobals();
  const { globals } = globalsCtx;

  // Build the facts payload.
  const buildCostPerSqftUsd =
    (project.build_cost_per_sqft ?? globals.default_build_cost_per_sqft) ?? 470;

  const subMarketLabel = prettifyMarketId(project.market ?? 'default');

  const phase = stageToPhase(project.stage);
  const isNc = isNewConstructionForPhase(phase, project.stage);

  const facts: ProjectFactsForBrief = {
    projectId: uuid,
    projectKey: ctx.params.id,
    name: project.name,
    address: project.address,
    googleMapsUrl: project.google_maps_url ?? null,
    marketId: project.market ?? 'default',
    subMarketLabel,
    isNewConstruction: isNc,
    villaSqftAg: project.villa_sqft_ag,
    villaSqftBg: project.villa_sqft_bg ?? 0,
    landCostUsd: project.land_cost_usd ?? 0,
    buildCostPerSqftUsd,
    softCostsLumpSumUsd: project.soft_costs_lump_sum ?? 0,
    closingCostsOverrideUsd: project.closing_costs_usd ?? null,
    // D-025b — location factors now live on the project row.
    yearBuilt: project.year_built ?? null,
    lotSizeAcres: project.lot_size_acres ?? null,
    waterfrontType: project.waterfront_type ?? null,
    viewPremium: project.view_premium ?? null,
    townProximity: project.town_proximity ?? null,
    phase,
  };

  const closingCosts = {
    variablePct: globals.closing_cost_variable_pct ?? 0.049,
    fixedUsd: globals.closing_cost_fixed_usd ?? 24_500,
  };

  const result = await generateStrategyBrief(facts, closingCosts, apiKey);

  // D-026: auto-save AI-researched comps to the library. Closed + active comps
  // get persisted with source='ai_research' so the /pricing dashboard can render
  // market intelligence. Dupes are silently skipped — unique indexes guard.
  const subCutKey = mapMarketIdToSubCutKey(project.market ?? 'default');
  const compsToSave: NewCompInput[] = [
    ...result.brief.compEvidence.closedComps,
    ...result.brief.compEvidence.activeComps,
  ]
    .filter((c) => c.address && c.agSqft > 0 && c.salePriceUsd > 0)
    .map((c) => ({
      address: c.address,
      subCutKey,
      waterfrontType: c.waterfrontType ?? null,
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
      notes: `Auto-saved from brief — ${c.sourceName}${c.confidence === 'estimated' ? ' (AI-estimated)' : ''}`,
    }));
  if (compsToSave.length > 0) {
    void bulkUpsertCompsIgnoreDupes(compsToSave).catch(() => {
      // Best-effort. Failing to save the library should not fail the brief.
    });
  }

  const inserted = await insertBrief({
    projectId: uuid,
    phase,
    brief: result.brief,
    usedWebSearch: result.usedWebSearch,
    compCount: result.compCount,
    dataGap: result.dataGap,
    generationError: result.error ?? null,
    generatedByUserId: user.id,
  });

  return created({ brief: inserted });
});

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Map the project's legacy market_id (flat slug like "sag_harbor") to a
 * sub-cut key (compound like "hamptons_sag_harbor") used by atlas.comps.
 * Best-effort: unknown markets fall back to a generic "hamptons_other".
 */
function mapMarketIdToSubCutKey(marketId: string): string {
  const id = marketId.toLowerCase();
  if (id === 'sag_harbor' || id === 'south_hampton' || id === 'southampton') {
    return id === 'sag_harbor' ? 'hamptons_sag_harbor' : 'hamptons_southampton';
  }
  if (id === 'east_hampton') return 'hamptons_east_hampton';
  if (id === 'bridgehampton') return 'hamptons_bridgehampton';
  if (id === 'amagansett') return 'hamptons_amagansett';
  if (id === 'montauk') return 'hamptons_montauk';
  if (id === 'north_haven') return 'hamptons_north_haven';
  if (id === 'shelter_island') return 'shelter_island_non_wf';
  if (id.startsWith('north_fork')) return 'north_fork_inland';
  // already a compound key — pass through.
  if (id.includes('_')) return id;
  return 'hamptons_other';
}

function prettifyMarketId(marketId: string): string {
  // Convert 'sag_harbor' → 'Sag Harbor'. Falls through for already-pretty values.
  return marketId
    .split(/[_\s]+/)
    .map((w) => (w.length === 0 ? '' : w[0]!.toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

function isNewConstructionForPhase(
  phase: ReturnType<typeof stageToPhase>,
  rawStage: string | null | undefined
): boolean {
  // Juno builds new construction. Resale-only flag would come from project metadata
  // (not present today). For now, treat all Juno projects as NC unless the stage
  // explicitly says 'resale'.
  const s = (rawStage ?? '').toLowerCase();
  if (s.includes('resale')) return false;
  // Prospect-phase projects are not yet built; still treat as NC since we're
  // pricing the future build.
  return phase !== 'prospect' ? true : true;
}
