import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SummaryTab } from '../summary-tab';
import type { ProjectResult } from '@/lib/calc/project/types';
import type { ProjectPnL, OwnerEarningRow } from '@/lib/finance/project-pnl';
import type { RolloutTriggerResult } from '@/lib/finance/rollout-trigger';
import type { DebtSnapshot } from '@/lib/finance/project-cashflow';

// The cash-flow chart pulls in recharts; stub it so the Summary tab renders
// cleanly in jsdom (we're testing the P&L + earnings markup, not the chart).
vi.mock('../cash-flow-chart', () => ({
  CashFlowChart: () => <div data-testid="cashflow" />,
}));

// next/link renders an <a> in jsdom; no mock needed.

const RESULT = {
  project_id: 'p2',
  project_name: '84 SBR',
  start_date: '2026-03',
  sale_date: '2028-01',
  monthly: { dates: ['2026-01'] },
  kpis: {},
} as unknown as ProjectResult;

// Self-consistent: 7.61 − (1.2+2.25+0.85+0.45+0.35) = 2.51 NPBT; 25% tax → 1.8825 NPAT.
const PNL: ProjectPnL = {
  gross_revenue_usd: 7_610_000,
  land_usd: 1_200_000,
  hard_construction_usd: 2_250_000,
  soft_costs_usd: 850_000,
  superstructure_usd: 450_000,
  financing_cost_usd: 350_000,
  closing_costs_memo_usd: 227_000,
  net_profit_before_tax_usd: 2_510_000,
  tax_rate_pct: 25,
  tax_usd: 627_500,
  net_profit_after_tax_usd: 1_882_500,
  npat_margin_pct: 0.2474,
  irr_annual: 0.997,
  moic: 1.87,
};

const OWNERS: OwnerEarningRow[] = [
  { key: 'peter', displayName: 'Peter', shareBps: 3800, earnings_usd: 715_350 },
  { key: 'lars', displayName: 'Lars', shareBps: 3000, earnings_usd: 564_750 },
  { key: 'viktor', displayName: 'Viktor', shareBps: 1700, earnings_usd: 320_025 },
];

const ROLLOUT_UNCONFIGURED: RolloutTriggerResult = {
  state: 'unconfigured',
  next_start_required_by: null,
  required_annual_npat_usd: null,
  current_trailing_12mo_npat_usd: 0,
  shortfall_month: null,
  months_until_required: null,
  rationale: 'Set an annual NPAT target in Settings → General to enable rollout pacing.',
};

const ROLLOUT_AMBER: RolloutTriggerResult = {
  state: 'amber',
  next_start_required_by: '2026-10',
  required_annual_npat_usd: 5_000_000,
  current_trailing_12mo_npat_usd: 1_800_000,
  shortfall_month: '2028-04',
  months_until_required: 4,
  rationale: 'Trailing-12-month NPAT dips below $5.0M in 2028-04.',
};

const DEBT: DebtSnapshot = {
  month: '2026-06',
  debt_outstanding: 1_430_000,
  interest_this_month: 12_000,
  is_forecast: true,
};

describe('SummaryTab', () => {
  it('renders all 9 P&L lines + the Margin/IRR/MOIC row', () => {
    render(
      <SummaryTab
        result={RESULT}
        pnl={PNL}
        ownerEarnings={null}
        rollout={ROLLOUT_UNCONFIGURED}
        debtSnapshot={DEBT}
      />
    );
    expect(screen.getByText('Gross revenue')).toBeInTheDocument();
    expect(screen.getByText('− Land')).toBeInTheDocument();
    expect(screen.getByText('− Hard construction')).toBeInTheDocument();
    expect(screen.getByText('− Soft costs')).toBeInTheDocument();
    expect(screen.getByText('− Superstructure')).toBeInTheDocument();
    expect(screen.getByText('− Financing cost')).toBeInTheDocument();
    expect(screen.getByText('Net profit before tax')).toBeInTheDocument();
    expect(screen.getByText('− Tax (25%)')).toBeInTheDocument();
    expect(screen.getByText('Net profit after tax')).toBeInTheDocument();
    expect(screen.getByText('Margin')).toBeInTheDocument();
    expect(screen.getByText('24.7%')).toBeInTheDocument();
    expect(screen.getByText('MOIC')).toBeInTheDocument();
  });

  it('renders the "Kingshaus"/"Prefab" stream as "Superstructure" (no legacy strings)', () => {
    const { container } = render(
      <SummaryTab
        result={RESULT}
        pnl={PNL}
        ownerEarnings={null}
        rollout={ROLLOUT_UNCONFIGURED}
        debtSnapshot={DEBT}
      />
    );
    expect(container.textContent).not.toMatch(/kingshaus|prefab/i);
    expect(screen.getByText('− Superstructure')).toBeInTheDocument();
  });

  it('shows closing costs as a memo, clearly not deducted', () => {
    render(
      <SummaryTab
        result={RESULT}
        pnl={PNL}
        ownerEarnings={null}
        rollout={ROLLOUT_UNCONFIGURED}
        debtSnapshot={DEBT}
      />
    );
    expect(screen.getByText(/memo/i)).toBeInTheDocument();
  });

  it('renders the owner-earnings split when provided (admin)', () => {
    render(
      <SummaryTab
        result={RESULT}
        pnl={PNL}
        ownerEarnings={OWNERS}
        rollout={ROLLOUT_UNCONFIGURED}
        debtSnapshot={DEBT}
      />
    );
    expect(screen.getByText(/Owner earnings/i)).toBeInTheDocument();
    expect(screen.getByText('Peter · 38.0%')).toBeInTheDocument();
    expect(screen.getByText('Lars · 30.0%')).toBeInTheDocument();
    expect(screen.getByText(/Total · 85.0%/)).toBeInTheDocument();
  });

  it('hides the owner-earnings split when not visible to the role', () => {
    render(
      <SummaryTab
        result={RESULT}
        pnl={PNL}
        ownerEarnings={null}
        rollout={ROLLOUT_UNCONFIGURED}
        debtSnapshot={DEBT}
      />
    );
    expect(screen.queryByText(/Owner earnings/i)).not.toBeInTheDocument();
  });

  it('shows the "set target" prompt when rollout is unconfigured (scaffold-blocked)', () => {
    render(
      <SummaryTab
        result={RESULT}
        pnl={PNL}
        ownerEarnings={null}
        rollout={ROLLOUT_UNCONFIGURED}
        debtSnapshot={DEBT}
      />
    );
    expect(screen.getByText('Rollout pacing')).toBeInTheDocument();
    expect(screen.getByText(/Set an annual NPAT target/i)).toBeInTheDocument();
  });

  it('shows the next-start date when rollout needs action', () => {
    render(
      <SummaryTab
        result={RESULT}
        pnl={PNL}
        ownerEarnings={null}
        rollout={ROLLOUT_AMBER}
        debtSnapshot={DEBT}
      />
    );
    expect(screen.getByText(/Next start needed by Oct 2026/i)).toBeInTheDocument();
  });

  it('renders the "What we owe today" debt snapshot', () => {
    render(
      <SummaryTab
        result={RESULT}
        pnl={PNL}
        ownerEarnings={null}
        rollout={ROLLOUT_UNCONFIGURED}
        debtSnapshot={DEBT}
      />
    );
    expect(screen.getByText('What we owe today')).toBeInTheDocument();
    expect(screen.getByText('Project debt outstanding')).toBeInTheDocument();
  });
});
