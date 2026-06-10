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
  updateProjectLocationFactors,
  getProjectPricingPremium,
  type ProjectLocationFactorsPatch,
} from '@/lib/repos/project';
import { listBriefs, insertBrief } from '@/lib/repos/pricing-briefs';
import {
  bulkUpsertCompsIgnoreDupes,
  findAnchorComps,
  findActiveCompsForSubCuts,
  type NewCompInput,
  type CompView,
} from '@/lib/repos/comps';
import { classifyLocation } from '@/lib/pricing/location-classifier';
import type { ResearchedComp } from '@/lib/pricing/comp-researcher';
import { getActiveGlobals } from '@/lib/globals/active';
import {
  generateStrategyBrief,
  stageToPhase,
  type ProjectFactsForBrief,
} from '@/lib/pricing/strategy-brief';
import { diffCompSets, summarizeChange } from '@/lib/pricing/comp-set-diff';

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

export const POST = withErrorBoundary(async (req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  // V6.1.5-018 — `forceResearch` is the "Update comps from market" path: pull
  // fresh web comps even when the stored library is deep. Default (plain
  // "Refresh") re-derives deterministically from stored comps.
  const body = (await req.json().catch(() => ({}))) as { forceResearch?: boolean };
  const forceResearch = body?.forceResearch === true;

  const project = await findCurrentProjectByKey(ctx.params.id);
  if (!project) return notFound(`Project "${ctx.params.id}" not found`, 'PROJECT_NOT_FOUND');
  const uuid = await findCurrentProjectUuidByKey(ctx.params.id);
  if (!uuid) return notFound(`Project "${ctx.params.id}" not found`, 'PROJECT_NOT_FOUND');

  // T090 — reject placeholder strings (TBC / "Site to be confirmed" / empty)
  // as well as null/missing. Belt-and-suspenders against stray seed data
  // that the 0023 migration didn't catch (e.g. a fresh seed run against a
  // misconfigured environment).
  const addrTrimmed = project.address?.trim() ?? '';
  const addrUpper = addrTrimmed.toUpperCase();
  const isPlaceholder =
    addrTrimmed === '' ||
    addrUpper === 'TBC' ||
    addrTrimmed.toLowerCase().startsWith('site to be confirmed');
  if (isPlaceholder || !project.villa_sqft_ag || project.villa_sqft_ag <= 0) {
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
    project.build_cost_per_sqft ?? globals.default_build_cost_per_sqft ?? 470;

  const subMarketLabel = prettifyMarketId(project.market ?? 'default');

  const phase = stageToPhase(project.stage);
  const isNc = isNewConstructionForPhase(phase, project.stage);

  // D-025b auto-detect — if the project has an address but no waterfront
  // class yet, classify its location factors from the address and use them
  // for this brief. Medium/high-confidence results are persisted back to the
  // project (fill-blanks only); low-confidence ones enrich this brief but are
  // NOT locked in, so a later run (or a human edit) can still refine them.
  const loc = {
    waterfrontType: project.waterfront_type ?? null,
    viewPremium: project.view_premium ?? null,
    townProximity: project.town_proximity ?? null,
    lotSizeAcres: project.lot_size_acres ?? null,
    yearBuilt: project.year_built ?? null,
  };
  if (!loc.waterfrontType && project.address) {
    try {
      const c = await classifyLocation(
        {
          address: project.address,
          googleMapsUrl: project.google_maps_url ?? null,
          subMarketLabel,
        },
        apiKey
      );
      const persistOk = c.confidence === 'high' || c.confidence === 'medium';
      const patch: ProjectLocationFactorsPatch = {};
      if (!loc.waterfrontType && c.waterfrontType) {
        loc.waterfrontType = c.waterfrontType;
        if (persistOk) patch.waterfrontType = c.waterfrontType;
      }
      if (!loc.viewPremium && c.viewPremium) {
        loc.viewPremium = c.viewPremium;
        if (persistOk) patch.viewPremium = c.viewPremium;
      }
      if (!loc.townProximity && c.townProximity) {
        loc.townProximity = c.townProximity;
        if (persistOk) patch.townProximity = c.townProximity;
      }
      if (loc.lotSizeAcres == null && c.lotSizeAcres != null) {
        loc.lotSizeAcres = c.lotSizeAcres;
        if (persistOk) patch.lotSizeAcres = c.lotSizeAcres;
      }
      if (loc.yearBuilt == null && c.yearBuilt != null) {
        loc.yearBuilt = c.yearBuilt;
        if (persistOk) patch.yearBuilt = c.yearBuilt;
      }
      if (Object.keys(patch).length > 0) {
        await updateProjectLocationFactors(uuid, patch).catch(() => {
          // best-effort enrichment — never fail the brief on a persist error
        });
      }
    } catch {
      // best-effort — brief proceeds with whatever factors already exist
    }
  }

  // V6.1.5-018 — load the PERSISTED in-sub-cut comp set. A refresh derives the
  // brief from these (deterministic, no web call); only when the library is too
  // thin (<3 closed) do we bootstrap with a live research below.
  const subCutKey = mapMarketIdToSubCutKey(project.market ?? 'default');
  const storedClosed = await findAnchorComps({
    subCutKey,
    waterfrontType: loc.waterfrontType ?? null,
    agSqft: project.villa_sqft_ag,
    limit: 12,
    minAnchors: 3,
  })
    .then((rows) => rows.map(libraryCompToResearched))
    .catch(() => []);
  const storedActive = await findActiveCompsForSubCuts([subCutKey])
    .then((rows) =>
      rows
        .map(libraryCompToResearched)
        .filter((c) => c.waterfrontType === (loc.waterfrontType ?? null))
    )
    .catch(() => []);
  const storedClosedCount = storedClosed.filter((c) => c.status === 'closed').length;

  const facts: ProjectFactsForBrief = {
    projectId: uuid,
    projectKey: ctx.params.id,
    name: project.name,
    // addrTrimmed is guaranteed non-empty here (the isPlaceholder guard
    // above would have returned 400 otherwise) — TS just can't narrow
    // through the boolean derived above. Safe-cast to string.
    address: addrTrimmed,
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
    // D-025b — location factors from the project row, enriched by auto-detect.
    yearBuilt: loc.yearBuilt,
    lotSizeAcres: loc.lotSizeAcres,
    waterfrontType: loc.waterfrontType,
    viewPremium: loc.viewPremium,
    townProximity: loc.townProximity,
    // V6.1.5-018 — the persisted in-sub-cut closed comps (hoisted above) double
    // as the library anchors the brief prompt treats as primary.
    libraryAnchors: storedClosed,
    phase,
  };

  const closingCosts = {
    variablePct: globals.closing_cost_variable_pct ?? 0.049,
    fixedUsd: globals.closing_cost_fixed_usd ?? 24_500,
  };

  // V6.1.5-018 — deterministic refresh when the library has ≥3 closed in-sub-cut
  // comps; otherwise bootstrap with a live research (which persists comps below
  // so the next refresh is stable). The launch price is engine-derived either way.
  // V6.1.5-019 — documented premium (deterministic; recorded per project).
  const premium = await getProjectPricingPremium(uuid).catch(() => ({
    premiumPct: null,
    premiumBasis: null,
  }));

  const useStored = storedClosedCount >= 3 && !forceResearch;
  const result = await generateStrategyBrief(facts, closingCosts, apiKey, {
    ...(useStored ? { storedComps: { closed: storedClosed, active: storedActive } } : {}),
    premiumPct: premium.premiumPct,
    premiumBasis: premium.premiumBasis,
  });

  // V6.1.5-018 (Phase 2) — on an "Update comps" pull, diff the freshly-researched
  // set against what was stored so we can tell the user what actually changed.
  const compChange = forceResearch
    ? diffCompSets(
        [...storedClosed, ...storedActive].map((c) => ({
          address: c.address,
          psf: c.psf,
          status: c.status,
        })),
        [...result.brief.compEvidence.closedComps, ...result.brief.compEvidence.activeComps].map(
          (c) => ({ address: c.address, psf: c.psf, status: c.status })
        )
      )
    : null;

  // D-026: auto-save AI-researched comps to the library. Closed + active comps
  // get persisted with source='ai_research' so the /pricing dashboard can render
  // market intelligence. Dupes are silently skipped — unique indexes guard.
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
      // V6.1.5 (T-PRC-2/3) stuck-listing provenance (Sonar path; undefined on Anthropic → defaults).
      relistCount: c.relistCount ?? 0,
      firstListedAt: c.firstListedAt ?? null,
      currentDomDays: c.status !== 'closed' ? (c.domDays ?? null) : null,
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
    citations: result.citations ?? null,
    llmProvider: result.llmProvider,
  });

  return created({
    brief: inserted,
    compChange: compChange ? { ...compChange, summary: summarizeChange(compChange) } : null,
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * D-026(a) — adapt a library CompView to the ResearchedComp shape the strategy
 * brief consumes. Only called for verified / ai_live comps from `findAnchorComps`
 * (ai_estimated is filtered out at the repo).
 */
function libraryCompToResearched(c: CompView): ResearchedComp {
  const salePriceUsd = c.salePriceCents != null ? c.salePriceCents / 100 : 0;
  const psf = c.psf ?? (c.agSqft > 0 ? salePriceUsd / c.agSqft : 0);
  return {
    address: c.address,
    salePriceUsd,
    agSqft: c.agSqft,
    closingDate: c.closingDate,
    // Status only ever 'closed' from the anchor query, but coerce defensively.
    status: c.status === 'active' ? 'active' : 'closed',
    yearBuilt: c.yearBuilt,
    lotSizeAcres: c.lotSizeAcres,
    waterfrontType: c.waterfrontType,
    isNewConstruction: c.isNc,
    domDays: c.domDays,
    sourceUrl: c.sourceUrl,
    sourceName:
      c.provenance === 'verified' ? 'Juno library (verified)' : 'Juno library (AI · live)',
    psf,
    // ai_live comps came from live web search → 'confirmed'. verified
    // (human-entered) is by definition the strongest signal — also 'confirmed'.
    confidence: 'confirmed',
    notes: c.notes,
  };
}

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
