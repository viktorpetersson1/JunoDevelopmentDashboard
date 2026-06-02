'use client';

/**
 * Portfolio-level cash flow chart. Reads PortfolioMonthlySeries from
 * aggregatePortfolio() (T042) — different shape than per-project so it
 * gets its own component:
 *   - Bars: net_cash + equity_called (the "true" cash request per month)
 *   - Line: closing_cash (rolling cumulative)
 *   - Line: loc_balance (KPC LOC utilization)
 */

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PortfolioMonthlySeries } from '@/lib/calc/portfolio/types';

interface ChartRow {
  date: string;
  netCash: number;
  equityCalled: number;
  closingCash: number;
  locBalance: number;
}

function buildRows(m: PortfolioMonthlySeries): ChartRow[] {
  const rows: ChartRow[] = new Array(m.dates.length);
  for (let i = 0; i < m.dates.length; i++) {
    rows[i] = {
      date: m.dates[i]!,
      netCash: m.net_cash[i] ?? 0,
      equityCalled: m.equity_called[i] ?? 0,
      closingCash: m.closing_cash[i] ?? 0,
      locBalance: m.loc_balance[i] ?? 0,
    };
  }
  return rows;
}

const compact = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
};

const tickMonth = (ym: string): string => (ym.endsWith('-01') ? ym.slice(0, 4) : '');

export function PortfolioCashFlowChart({ monthly }: { monthly: PortfolioMonthlySeries }) {
  const data = buildRows(monthly);
  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--color-border-subtle)" />
          <XAxis
            dataKey="date"
            tickFormatter={tickMonth}
            tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
            stroke="var(--color-border-hairline)"
          />
          <YAxis
            tickFormatter={compact}
            tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
            stroke="var(--color-border-hairline)"
            width={56}
          />
          <Tooltip
            formatter={(v: number | string) => (typeof v === 'number' ? compact(v) : String(v))}
            labelStyle={{ color: 'var(--color-text-primary)', fontSize: 12 }}
            contentStyle={{
              background: 'var(--color-surface-base)',
              border: 'var(--ja-card-border)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          {/* T103.10 — monochrome palette per COLOR_TOKENS.md */}
          <ReferenceLine y={0} stroke="var(--chart-axis-line, #b0b5bc)" strokeWidth={1} />
          <Bar
            dataKey="netCash"
            name="Net cash"
            fill="var(--chart-default-1, #0d0d0d)"
            opacity={0.55}
          />
          <Bar
            dataKey="equityCalled"
            name="Equity called"
            fill="var(--chart-default-3, #8a8780)"
            opacity={0.7}
          />
          <Line
            type="monotone"
            dataKey="closingCash"
            name="Closing cash"
            stroke="var(--chart-default-1, #0d0d0d)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="locBalance"
            name="LOC balance"
            stroke="var(--chart-default-2, #4b4b48)"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
