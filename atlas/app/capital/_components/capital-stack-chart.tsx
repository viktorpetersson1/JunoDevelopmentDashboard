'use client';

/**
 * V4.2 — Capital stack chart (INVENTORY §17 Capital overview / Capital stack).
 *
 * Stacked area: senior debt balance + KPC LOC balance + cumulative owner
 * equity called, by month. Shows the layered capital structure each month
 * of the model horizon — at a glance, the user sees the equity:debt mix
 * evolving as projects fund and exit.
 */

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PortfolioMonthlySeries } from '@/lib/calc/portfolio/types';

interface Row {
  date: string;
  seniorDebt: number;
  loc: number;
  equity: number;
}

const compact = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
};

const tickMonth = (ym: string): string => (ym.endsWith('-01') ? ym.slice(0, 4) : '');

export function CapitalStackChart({ monthly }: { monthly: PortfolioMonthlySeries }) {
  const data: Row[] = monthly.dates.map((d, i) => ({
    date: d,
    seniorDebt: monthly.debt_balance[i] ?? 0,
    loc: monthly.loc_balance[i] ?? 0,
    equity: monthly.cum_equity_called[i] ?? 0,
  }));

  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
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
          <Area
            type="monotone"
            dataKey="seniorDebt"
            stackId="stack"
            name="Senior debt"
            stroke="var(--color-text-secondary)"
            fill="var(--color-text-secondary)"
            fillOpacity={0.25}
          />
          <Area
            type="monotone"
            dataKey="loc"
            stackId="stack"
            name="KPC LOC"
            stroke="var(--color-negative, #dc2626)"
            fill="var(--color-negative, #dc2626)"
            fillOpacity={0.25}
          />
          <Area
            type="monotone"
            dataKey="equity"
            stackId="stack"
            name="Owner equity called"
            stroke="var(--color-accent-lime-pressed, #c5d44c)"
            fill="var(--color-accent-lime, #ddec65)"
            fillOpacity={0.4}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
