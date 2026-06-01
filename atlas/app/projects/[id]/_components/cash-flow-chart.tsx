'use client';

/**
 * T046.1 — Cash flow chart for the project Summary tab.
 *
 * Recharts composed chart:
 *   - Bars: net_cash per month (positive = cash in, negative = cash out)
 *   - Line: debt_balance over time (outstanding senior debt)
 *   - Line: equity_balance over time (outstanding equity)
 *
 * Pure presentation: receives the already-computed MonthlySeries and renders.
 * Marked client because recharts uses ResponsiveContainer + ResizeObserver.
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
import type { MonthlySeries } from '@/lib/calc/project/types';

interface ChartRow {
  date: string;
  netCash: number;
  debt: number;
  equity: number;
}

function buildRows(monthly: MonthlySeries): ChartRow[] {
  const rows: ChartRow[] = new Array(monthly.dates.length);
  for (let i = 0; i < monthly.dates.length; i++) {
    rows[i] = {
      date: monthly.dates[i]!,
      netCash: monthly.net_cash[i] ?? 0,
      debt: monthly.debt_balance[i] ?? 0,
      equity: monthly.equity_balance[i] ?? 0,
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

const tickMonth = (ym: string): string => {
  // Show year on Jan, blank otherwise — keeps the axis readable for 49-mo horizon.
  if (ym.endsWith('-01')) return ym.slice(0, 4);
  return '';
};

export function CashFlowChart({ monthly }: { monthly: MonthlySeries }) {
  const data = buildRows(monthly);
  return (
    <section
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 14,
        padding: 24,
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 16,
        }}
      >
        <h2
          style={{
            fontSize: 16,
            fontWeight: 600,
            margin: 0,
            color: 'var(--color-text-primary)',
          }}
        >
          Cash flow &amp; balances
        </h2>
        <span
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-text-tertiary)',
          }}
        >
          monthly · {data.length} months
        </span>
      </header>
      <div style={{ width: '100%', height: 280 }}>
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
                border: '1px solid var(--color-border-hairline)',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            <ReferenceLine y={0} stroke="var(--color-border-strong)" strokeWidth={1} />
            <Bar
              dataKey="netCash"
              name="Net cash"
              fill="var(--color-accent-base, #131313)"
              opacity={0.65}
            />
            <Line
              type="monotone"
              dataKey="debt"
              name="Debt balance"
              stroke="var(--color-status-warning, #d97706)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="equity"
              name="Equity balance"
              stroke="var(--color-status-info, #2563eb)"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
