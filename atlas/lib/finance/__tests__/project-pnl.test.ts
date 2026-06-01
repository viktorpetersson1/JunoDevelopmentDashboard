import { describe, it, expect } from 'vitest';
import { computePnl } from '@/lib/calc/project/pnl';
import type { MonthlySeries, ProjectInput, ProjectResult } from '@/lib/calc/project/types';
import {
  buildProjectPnL,
  allocateOwnerEarnings,
  DEFAULT_PROJECT_TAX_RATE_PCT,
} from '../project-pnl';

function blankSeries(n: number): MonthlySeries {
  const a = () => new Array<number>(n).fill(0);
  return {
    dates: new Array<string>(n).fill('2026-01'),
    sales: a(),
    land_cost: a(),
    build_cost: a(),
    kingshaus: a(),
    soft_cost: a(),
    interest: a(),
    debt_drawn: a(),
    debt_repaid: a(),
    debt_balance: a(),
    equity_drawn: a(),
    equity_returned: a(),
    equity_balance: a(),
    net_cash: a(),
  };
}

/** Wrap a known monthly series into a ProjectResult using the REAL engine
 *  P&L roll-up, so the test exercises actual engine numbers (not hand-rolled). */
function makeResult(over?: (s: MonthlySeries) => void): ProjectResult {
  const out = blankSeries(36);
  out.sales[24] = 7_610_000;
  out.land_cost[0] = -1_200_000;
  out.build_cost[6] = -2_250_000;
  out.soft_cost[2] = -850_000;
  out.kingshaus[6] = -450_000;
  out.interest[24] = -350_000;
  over?.(out);
  const proj = {
    id: 'p',
    name: 'P',
    villa_sqft: 4000,
    land_cost_usd: 1_200_000,
    program_months: 24,
    start_date: '2026-01',
  } as ProjectInput;
  const kpis = computePnl(out, proj, { salePerSqft: 1800, totalCostPerSqft: 1200 });
  return {
    project_id: 'p',
    project_name: 'P',
    sale_date: '2028-01',
    start_date: '2026-01',
    monthly: out,
    kpis,
  };
}

describe('buildProjectPnL', () => {
  it('reconstructs NPBT from the cost lines with no drift (Hard Rule #2)', () => {
    const r = makeResult();
    const pnl = buildProjectPnL(r, { taxRatePct: 25, closingCostsUsd: 150_000 });

    // NPBT is the engine's gross_profit verbatim.
    expect(pnl.net_profit_before_tax_usd).toBe(r.kpis.gross_profit);

    // The 6 deducted lines reconcile to NPBT within a cent.
    const reconstructed =
      pnl.gross_revenue_usd -
      pnl.land_usd -
      pnl.hard_construction_usd -
      pnl.soft_costs_usd -
      pnl.superstructure_usd -
      pnl.financing_cost_usd;
    expect(reconstructed).toBeCloseTo(pnl.net_profit_before_tax_usd, 2);
  });

  it('maps each engine cost stream to the right P&L line', () => {
    const pnl = buildProjectPnL(makeResult());
    expect(pnl.gross_revenue_usd).toBe(7_610_000);
    expect(pnl.land_usd).toBe(1_200_000);
    expect(pnl.hard_construction_usd).toBe(2_250_000);
    expect(pnl.soft_costs_usd).toBe(850_000);
    expect(pnl.superstructure_usd).toBe(450_000); // engine "kingshaus" → Superstructure
    expect(pnl.financing_cost_usd).toBe(350_000);
  });

  it('treats closing costs as a memo — they do NOT reduce NPBT/NPAT', () => {
    const r = makeResult();
    const withClosing = buildProjectPnL(r, { taxRatePct: 25, closingCostsUsd: 150_000 });
    const without = buildProjectPnL(r, { taxRatePct: 25, closingCostsUsd: 0 });
    expect(withClosing.closing_costs_memo_usd).toBe(150_000);
    expect(withClosing.net_profit_before_tax_usd).toBe(without.net_profit_before_tax_usd);
    expect(withClosing.net_profit_after_tax_usd).toBe(without.net_profit_after_tax_usd);
  });

  it('applies the per-project tax rate; NPAT = NPBT − tax', () => {
    const pnl = buildProjectPnL(makeResult(), { taxRatePct: 25 });
    expect(pnl.tax_usd).toBeCloseTo(pnl.net_profit_before_tax_usd * 0.25, 2);
    expect(pnl.net_profit_after_tax_usd).toBeCloseTo(
      pnl.net_profit_before_tax_usd - pnl.tax_usd,
      6
    );
    expect(pnl.npat_margin_pct).toBeCloseTo(
      pnl.net_profit_after_tax_usd / pnl.gross_revenue_usd,
      6
    );
  });

  it('defaults the tax rate when none is supplied', () => {
    const pnl = buildProjectPnL(makeResult(), {});
    expect(pnl.tax_rate_pct).toBe(DEFAULT_PROJECT_TAX_RATE_PCT);
  });

  it('floors tax at 0 on a loss (no phantom benefit)', () => {
    // Wipe the sale so the project runs at a loss.
    const r = makeResult((s) => {
      s.sales[24] = 0;
    });
    const pnl = buildProjectPnL(r, { taxRatePct: 25 });
    expect(pnl.net_profit_before_tax_usd).toBeLessThan(0);
    expect(pnl.tax_usd).toBe(0);
    expect(pnl.net_profit_after_tax_usd).toBe(pnl.net_profit_before_tax_usd);
  });
});

describe('allocateOwnerEarnings', () => {
  const OWNERS = [
    { key: 'peter', displayName: 'Peter', shareBps: 3800 },
    { key: 'lars', displayName: 'Lars', shareBps: 3000 },
    { key: 'viktor', displayName: 'Viktor', shareBps: 1700 },
    { key: 'philip', displayName: 'Philip', shareBps: 500 },
    { key: 'missy', displayName: 'Missy', shareBps: 500 },
    { key: 'massi', displayName: 'Massi', shareBps: 250 },
    { key: 'mark', displayName: 'Mark', shareBps: 250 },
  ];

  it('splits NPAT by bps and sums EXACTLY to round(NPAT)', () => {
    // A deliberately awkward number to force a rounding remainder.
    const npat = 1_460_333;
    const rows = allocateOwnerEarnings(npat, OWNERS);
    const total = rows.reduce((s, r) => s + r.earnings_usd, 0);
    expect(total).toBe(Math.round(npat));
    // Largest share (Peter, 38%) gets the largest slice.
    const peter = rows.find((r) => r.key === 'peter')!;
    expect(peter.earnings_usd).toBeCloseTo(npat * 0.38, -3);
  });

  it('handles an empty owner set', () => {
    expect(allocateOwnerEarnings(1_000_000, [])).toEqual([]);
  });
});
