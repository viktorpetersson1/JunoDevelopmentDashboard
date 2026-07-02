/**
 * V7 T130 — THE single source of truth for the KPC LOC / capital position.
 *
 * Before this module, three code paths answered "what is our facility?":
 *   1. Home's chip read atlas.capital_sources ($6.0M — correct) with a
 *      hardcoded `6_000_000` fallback when the read failed (Rule-6 violation);
 *   2. the calc engine read `globals.kpc_loc` — which getActiveGlobals() NEVER
 *      populated (BASELINE_GLOBALS carries no kpc_loc), so every engine output
 *      (LOC peak, cap-breach months, "owner equity beyond capacity") computed
 *      against a $0 facility;
 *   3. the T120 cash schedule read atlas.capital_sources directly (correct).
 * Result: "KPC LOC $6.00M headroom · 0% utilized" and "0% of $0.0M facility ·
 * exhausted 15 months" rendered in the same session. V7 Hard Rule 1 forbids this.
 *
 * Now: every surface and every engine invocation resolves the facility through
 * `getCapitalPosition()` — either a fully-resolved facility model or
 * `{ configured: false }`. Rule 6: unconfigured renders an explicit empty state,
 * never $0, and never feeds a derived red alert. There is NO fallback constant.
 */

import { findActiveKpcLoc } from '@/lib/repos/capital-sources';
import { getActiveGlobals } from '@/lib/globals/active';
import type { Globals } from '@/lib/calc/project/types';

export type CapitalPosition =
  | { configured: false }
  | {
      configured: true;
      sourceId: string;
      sourceName: string;
      facilityUsd: number;
      drawnUsd: number;
      headroomUsd: number;
      /** Decimal APR (0.06 = 6%). */
      interestRate: number;
    };

/**
 * Resolve the active KPC LOC from the versioned ledger. A missing row, a
 * non-positive limit, or a read failure all resolve to `configured: false` —
 * the caller renders an empty state. We never substitute a made-up facility.
 */
export async function getCapitalPosition(): Promise<CapitalPosition> {
  try {
    const kpc = await findActiveKpcLoc();
    if (!kpc || kpc.limitUsd <= 0) return { configured: false };
    return {
      configured: true,
      sourceId: kpc.id,
      sourceName: kpc.sourceName,
      facilityUsd: kpc.limitUsd,
      drawnUsd: kpc.drawnUsd,
      headroomUsd: Math.max(0, kpc.limitUsd - kpc.drawnUsd),
      interestRate: kpc.interestRatePct ?? 0,
    };
  } catch {
    // Fail to the explicit empty state, never to fake numbers (Rule 6).
    return { configured: false };
  }
}

/**
 * Inject the resolved facility into engine globals (the calc engine reads the
 * optional nested `kpc_loc` object; lib/calc itself is frozen — this is the
 * input-assembly seam). Unconfigured strips any stale kpc_loc so the engine's
 * LOC outputs are transparently zero AND the UI knows (via the position) not
 * to render them as alerts.
 */
export function applyCapitalPositionToGlobals<G extends Globals>(
  globals: G,
  position: CapitalPosition
): G {
  if (!position.configured) {
    return { ...globals, kpc_loc: undefined } as G;
  }
  return {
    ...globals,
    kpc_loc: {
      facility_size_usd: position.facilityUsd,
      interest_rate_apr: position.interestRate,
      capitalize_interest: true,
      provider: position.sourceName,
    },
  } as G;
}

/**
 * The one-call helper for pages that run the engine: active globals with the
 * capital position already applied, plus the position for UI gating.
 */
export async function getActiveGlobalsWithCapital(): Promise<{
  globals: Globals;
  position: CapitalPosition;
  isBaseline: boolean;
  updatedAt: string | null;
}> {
  const [globalsCtx, position] = await Promise.all([getActiveGlobals(), getCapitalPosition()]);
  return {
    globals: applyCapitalPositionToGlobals(globalsCtx.globals, position),
    position,
    isBaseline: globalsCtx.isBaseline,
    updatedAt: globalsCtx.updatedAt,
  };
}
