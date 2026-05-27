'use client';

/**
 * V4.4 — Equity timeline chart (INVENTORY §18 Owner Waterfall / Equity timeline).
 *
 * Plots cumulative equity drawn vs cumulative equity returned across the
 * model horizon. The crossover point is the portfolio's payback month.
 *
 * Uses the portfolio aggregator's pre-computed `cum_equity_drawn` +
 * `cum_equity_returned` series — no recompute here.
 */

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PortfolioMonthlySeries } from '@/lib/calc/portfolio/types';

interface Row {
  date: string;
  drawn: number;
  returned: number;
}

const compact = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
};

const tickMonth = (ym: string): string => (ym.endsWith('-01') ? ym.slice(0, 4) : '');

export function EquityTimelineChart({ monthly }: { monthly: PortfolioMonthlySeries }) {
  const data: Row[] = monthly.dates.map((d, i) => ({
    date: d,
    drawn: monthly.cum_equity_drawn[i] ?? 0,
    returned: monthly.cum_equity_returned[i] ?? 0,
  }));

  return (
    <div style={{ width: '100%', height: 260 }}>
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
            formatter={(v: number | string) =>
              typeof v === 'number' ? compact(v) : String(v)
            }
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
          <Area
            type="monotone"
            dataKey="drawn"
            name="Cumulative equity drawn"
            stroke="var(--color-negative, #dc2626)"
            fill="var(--color-negative, #dc2626)"
            fillOpacity={0.12}
          />
          <Area
            type="monotone"
            dataKey="returned"
            name="Cumulative equity returned"
            stroke="var(--color-positive, #15803d)"
            fill="var(--color-positive, #15803d)"
            fillOpacity={0.12}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
