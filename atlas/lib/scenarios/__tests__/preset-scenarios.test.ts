/**
 * V7 T137 — the topbar presets ACTUALLY recompute.
 *
 * Two seams asserted:
 *   1. Engine: aggregatePortfolio over the fixtures under PESSIMISTIC /
 *      OPTIMISTIC produces materially different numbers than base, in the
 *      right direction (sale ×0.9 ⇒ lower revenue; ×1.05 ⇒ higher; build
 *      ×1.1 ⇒ higher dev cost; +3mo timing ⇒ later first sale).
 *   2. Cookie: getActiveScenario maps `preset:*` values to the baselines
 *      constants locally (no DB), stale values fall back to base, and the
 *      activeClass drives the topbar chip.
 *
 * Engine untouched — presets are additive constants (Hard Rule 2).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BASELINE_GLOBALS,
  BASELINE_SCENARIO,
  PESSIMISTIC_SCENARIO,
  OPTIMISTIC_SCENARIO,
  PRESET_SCENARIOS,
} from '@/lib/calc/baselines';
import { aggregatePortfolio } from '@/lib/calc/portfolio/aggregate';
import type { ProjectInput } from '@/lib/calc/project/types';

// ── Cookie-layer mocks (next/headers has no request scope in vitest) ────────
const cookieGet = vi.fn<(name: string) => { value: string } | undefined>();
vi.mock('next/headers', () => ({
  cookies: () => ({ get: cookieGet }),
}));
const findScenarioById = vi.fn();
vi.mock('@/lib/repos/scenarios', () => ({
  findScenarioById: (id: string) => findScenarioById(id),
  viewToCalcScenario: (v: unknown) => v,
}));

import { getActiveScenario, parsePresetCookie } from '@/lib/scenarios/active';

const FIXTURES_DIR = resolve(__dirname, '../../../tests/fixtures/vanilla-snapshots');

function loadFixtures(): ProjectInput[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.startsWith('project-') && f.endsWith('.json'))
    .sort()
    .map(
      (f) =>
        (
          JSON.parse(readFileSync(resolve(FIXTURES_DIR, f), 'utf-8')) as {
            inputs: { project: ProjectInput };
          }
        ).inputs.project
    );
}

describe('T137 presets — the engine recomputes', () => {
  const fixtures = loadFixtures();
  const base = aggregatePortfolio(fixtures, BASELINE_GLOBALS, BASELINE_SCENARIO);
  const pess = aggregatePortfolio(fixtures, BASELINE_GLOBALS, PESSIMISTIC_SCENARIO);
  const opti = aggregatePortfolio(fixtures, BASELINE_GLOBALS, OPTIMISTIC_SCENARIO);

  it('pessimistic: lower revenue, higher dev cost, lower profit than base', () => {
    expect(pess.kpis.total_sales).toBeLessThan(base.kpis.total_sales);
    expect(pess.kpis.total_dev_cost).toBeGreaterThan(base.kpis.total_dev_cost);
    expect(pess.kpis.total_profit_before_tax).toBeLessThan(base.kpis.total_profit_before_tax);
  });

  it('optimistic: higher revenue, lower dev cost, higher profit than base', () => {
    expect(opti.kpis.total_sales).toBeGreaterThan(base.kpis.total_sales);
    expect(opti.kpis.total_dev_cost).toBeLessThan(base.kpis.total_dev_cost);
    expect(opti.kpis.total_profit_before_tax).toBeGreaterThan(base.kpis.total_profit_before_tax);
  });

  it('the sale multipliers land (×1.05 exact; ×0.9 an upper bound under +3mo shift)', () => {
    // Optimistic has timing_shift 0 → revenue is exactly base × 1.05.
    expect(opti.kpis.total_sales).toBeCloseTo(base.kpis.total_sales * 1.05, 2);
    // Pessimistic shifts everything +3 months, which can push late sales
    // past the fixed model horizon — so ×0.9 is the CEILING, not the value.
    expect(pess.kpis.total_sales).toBeLessThanOrEqual(base.kpis.total_sales * 0.9 + 0.01);
    expect(pess.kpis.total_sales).toBeGreaterThan(0);
  });

  it('PRESET_SCENARIOS maps the three chip classes', () => {
    expect(PRESET_SCENARIOS.base).toBe(BASELINE_SCENARIO);
    expect(PRESET_SCENARIOS.pessimistic).toBe(PESSIMISTIC_SCENARIO);
    expect(PRESET_SCENARIOS.optimistic).toBe(OPTIMISTIC_SCENARIO);
  });
});

describe('T137 cookie mapping — getActiveScenario', () => {
  beforeEach(() => {
    cookieGet.mockReset();
    findScenarioById.mockReset();
  });

  it('no cookie → base', async () => {
    cookieGet.mockReturnValue(undefined);
    const a = await getActiveScenario();
    expect(a.isBase).toBe(true);
    expect(a.activeClass).toBe('base');
    expect(a.scenario).toBe(BASELINE_SCENARIO);
  });

  it('preset:pessimistic → PESSIMISTIC_SCENARIO with no DB read', async () => {
    cookieGet.mockReturnValue({ value: 'preset:pessimistic' });
    const a = await getActiveScenario();
    expect(a.scenario).toBe(PESSIMISTIC_SCENARIO);
    expect(a.activeClass).toBe('pessimistic');
    expect(a.displayName).toBe('Pessimistic');
    expect(a.isBase).toBe(false);
    expect(findScenarioById).not.toHaveBeenCalled();
  });

  it('preset:optimistic → OPTIMISTIC_SCENARIO', async () => {
    cookieGet.mockReturnValue({ value: 'preset:optimistic' });
    const a = await getActiveScenario();
    expect(a.scenario).toBe(OPTIMISTIC_SCENARIO);
    expect(a.activeClass).toBe('optimistic');
  });

  it('stale saved-scenario uuid → falls back to base', async () => {
    cookieGet.mockReturnValue({ value: '00000000-0000-0000-0000-000000000001' });
    findScenarioById.mockResolvedValue(null);
    const a = await getActiveScenario();
    expect(a.isBase).toBe(true);
    expect(a.activeClass).toBe('base');
  });

  it('saved scenario keeps working (legacy cookie); downside/upside map to the chips', async () => {
    cookieGet.mockReturnValue({ value: '00000000-0000-0000-0000-000000000002' });
    findScenarioById.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000002',
      name: 'My downside',
      class: 'downside',
    });
    const a = await getActiveScenario();
    expect(a.displayName).toBe('My downside');
    expect(a.activeClass).toBe('pessimistic');
    expect(a.isBase).toBe(false);
  });

  it('parsePresetCookie only accepts the two preset values', () => {
    expect(parsePresetCookie('preset:pessimistic')).toBe('pessimistic');
    expect(parsePresetCookie('preset:optimistic')).toBe('optimistic');
    expect(parsePresetCookie('preset:custom')).toBeNull();
    expect(parsePresetCookie('')).toBeNull();
    expect(parsePresetCookie(undefined)).toBeNull();
  });
});
