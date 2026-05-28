/**
 * POST /api/pricing/market-research
 *
 * D-026 — Bootstrap market intelligence.
 *
 * Researches recent residential sales activity across every sub-cut in the
 * East End umbrella market and auto-saves results to atlas.comps. Lets the
 * /pricing dashboard show meaningful data before any project brief has run.
 *
 * Runs all sub-cut calls in parallel (~9 concurrent Claude requests, each
 * ~15-25s). Total wall-clock typically 25-35s, dominated by the slowest
 * single response. Uses Promise.allSettled so one sub-cut failing doesn't
 * lose the others.
 *
 * Auth: editor or super_admin only.
 * Idempotency: existing comps with the same address + closing_date are
 * silently skipped via atlas.comps partial unique indexes.
 */

import type { NextRequest } from 'next/server';
import { ok, badRequest } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { findMarketByKey } from '@/lib/repos/markets';
import {
  bulkUpsertCompsIgnoreDupes,
  type NewCompInput,
} from '@/lib/repos/comps';
import {
  researchMarketActivity,
  type CompResearchOutput,
} from '@/lib/pricing/comp-researcher';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

// Note: this endpoint runs for ~30s. The default edge config tolerates this
// because the work is HTTP-bound, not CPU-bound. If CF Pages starts killing
// requests, switch to a Supabase Edge Function or split into per-sub-cut
// calls fired from the client in sequence.

export const POST = withErrorBoundary(async (_req: NextRequest) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return badRequest(
      'ANTHROPIC_API_KEY not configured — market research unavailable.',
      'NO_API_KEY'
    );
  }

  const market = await findMarketByKey('east_end_li');
  if (!market || market.subCuts.length === 0) {
    return badRequest(
      'East End market is not configured — seed atlas.markets first.',
      'MARKET_NOT_FOUND'
    );
  }

  // Fan out — one Claude call per sub-cut, all in parallel.
  const results = await Promise.allSettled(
    market.subCuts.map(async (sc) => {
      const output = await researchMarketActivity(
        { subCutLabel: sc.label, windowMonths: 12, maxClosed: 8, maxActive: 4 },
        apiKey
      );
      return { subCutKey: sc.key, subCutLabel: sc.label, output };
    })
  );

  // Bulk-save all returned comps. We don't await each save in turn — collect
  // everything then a single round-trip-per-sub-cut.
  let totalInserted = 0;
  let totalSkipped = 0;
  const perSubCut: Array<{
    subCutKey: string;
    found: number;
    inserted: number;
    skipped: number;
    usedWebSearch: boolean;
    narrative: string;
    error?: string;
  }> = [];

  for (const r of results) {
    if (r.status === 'rejected') {
      perSubCut.push({
        subCutKey: 'unknown',
        found: 0,
        inserted: 0,
        skipped: 0,
        usedWebSearch: false,
        narrative: 'Sub-cut research failed.',
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
      continue;
    }
    const { subCutKey, output } = r.value;
    const inputs = mapResearchedToCompInputs(output, subCutKey);
    if (inputs.length === 0) {
      perSubCut.push({
        subCutKey,
        found: 0,
        inserted: 0,
        skipped: 0,
        usedWebSearch: output.usedWebSearch,
        narrative: output.narrativeSummary,
        ...(output.error ? { error: output.error } : {}),
      });
      continue;
    }
    const { inserted, skipped } = await bulkUpsertCompsIgnoreDupes(inputs);
    totalInserted += inserted;
    totalSkipped += skipped;
    perSubCut.push({
      subCutKey,
      found: output.comps.length,
      inserted,
      skipped,
      usedWebSearch: output.usedWebSearch,
      narrative: output.narrativeSummary,
      ...(output.error ? { error: output.error } : {}),
    });
  }

  return ok({
    subCutsResearched: market.subCuts.length,
    totalCompsFound: perSubCut.reduce((sum, p) => sum + p.found, 0),
    totalInserted,
    totalSkipped,
    perSubCut,
    requestedBy: user.id,
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function mapResearchedToCompInputs(
  output: CompResearchOutput,
  subCutKey: string
): NewCompInput[] {
  return output.comps
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
      notes: `Auto-saved from market research — ${c.sourceName}${c.confidence === 'estimated' ? ' (AI-estimated)' : ''}`,
    }));
}
