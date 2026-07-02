/**
 * V7 T130 — capital position single source of truth.
 * The Rule-1 test: the chip value and the engine's kpc_loc_config must come
 * from the same resolved position; unconfigured yields empty-state signals,
 * never $0 facilities or fallback constants.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/repos/capital-sources', () => ({
  findActiveKpcLoc: vi.fn(),
}));
vi.mock('@/lib/globals/active', () => ({
  getActiveGlobals: vi.fn(),
}));

import { findActiveKpcLoc } from '@/lib/repos/capital-sources';
import { getActiveGlobals } from '@/lib/globals/active';
import {
  getCapitalPosition,
  applyCapitalPositionToGlobals,
  getActiveGlobalsWithCapital,
} from '@/lib/treasury/capital-position';
import { BASELINE_GLOBALS } from '@/lib/calc/baselines';
import { aggregatePortfolio } from '@/lib/calc/portfolio/aggregate';
import { BASELINE_SCENARIO } from '@/lib/calc/baselines';

const kpcMock = vi.mocked(findActiveKpcLoc);
const globalsMock = vi.mocked(getActiveGlobals);

const KPC_ROW = {
  id: 'src-1',
  sourceName: 'KPC Family Office LOC',
  limitUsd: 6_000_000,
  drawnUsd: 0,
  interestRatePct: 0.06,
} as unknown as Awaited<ReturnType<typeof findActiveKpcLoc>>;

beforeEach(() => {
  kpcMock.mockReset();
  globalsMock.mockReset();
  globalsMock.mockResolvedValue({ globals: BASELINE_GLOBALS, isBaseline: true, updatedAt: null });
});

describe('getCapitalPosition', () => {
  it('resolves the configured facility from the ledger', async () => {
    kpcMock.mockResolvedValue(KPC_ROW);
    const p = await getCapitalPosition();
    expect(p).toEqual({
      configured: true,
      sourceId: 'src-1',
      sourceName: 'KPC Family Office LOC',
      facilityUsd: 6_000_000,
      drawnUsd: 0,
      headroomUsd: 6_000_000,
      interestRate: 0.06,
    });
  });

  it('is unconfigured when no row exists — never a fallback constant', async () => {
    kpcMock.mockResolvedValue(null);
    expect(await getCapitalPosition()).toEqual({ configured: false });
  });

  it('is unconfigured on a non-positive limit', async () => {
    kpcMock.mockResolvedValue({ ...(KPC_ROW as object), limitUsd: 0 } as typeof KPC_ROW);
    expect(await getCapitalPosition()).toEqual({ configured: false });
  });

  it('fails to the empty state on a read error (Rule 6), never fake numbers', async () => {
    kpcMock.mockRejectedValue(new Error('db down'));
    expect(await getCapitalPosition()).toEqual({ configured: false });
  });
});

describe('applyCapitalPositionToGlobals + Rule 1 (engine agreement)', () => {
  it('the engine reports EXACTLY the resolved facility (no second code path)', async () => {
    kpcMock.mockResolvedValue(KPC_ROW);
    const position = await getCapitalPosition();
    const globals = applyCapitalPositionToGlobals(BASELINE_GLOBALS, position);
    const port = aggregatePortfolio([], globals, BASELINE_SCENARIO);
    if (!position.configured) throw new Error('expected configured');
    expect(port.monthly.kpc_loc_config.facility_size_usd).toBe(position.facilityUsd);
    expect(port.monthly.kpc_loc_config.interest_rate_apr).toBe(position.interestRate);
  });

  it('unconfigured strips kpc_loc — engine facility is 0 AND the UI knows why', () => {
    const globals = applyCapitalPositionToGlobals(
      { ...BASELINE_GLOBALS, kpc_loc: { facility_size_usd: 123 } } as typeof BASELINE_GLOBALS & {
        kpc_loc?: { facility_size_usd?: number };
      },
      { configured: false }
    );
    expect((globals as { kpc_loc?: unknown }).kpc_loc).toBeUndefined();
  });

  it('does not touch unrelated globals', () => {
    const globals = applyCapitalPositionToGlobals(BASELINE_GLOBALS, {
      configured: true,
      sourceId: 's',
      sourceName: 'n',
      facilityUsd: 1,
      drawnUsd: 0,
      headroomUsd: 1,
      interestRate: 0.05,
    });
    expect(globals.model_start).toBe(BASELINE_GLOBALS.model_start);
    expect(globals.tax_rate_pct).toBe(BASELINE_GLOBALS.tax_rate_pct);
  });
});

describe('getActiveGlobalsWithCapital', () => {
  it('returns overlaid globals + the position in one call', async () => {
    kpcMock.mockResolvedValue(KPC_ROW);
    const out = await getActiveGlobalsWithCapital();
    expect(out.position.configured).toBe(true);
    expect(
      (out.globals as { kpc_loc?: { facility_size_usd?: number } }).kpc_loc?.facility_size_usd
    ).toBe(6_000_000);
    expect(out.isBaseline).toBe(true);
  });
});
