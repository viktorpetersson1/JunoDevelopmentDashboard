'use client';

/**
 * V6.2 T125 — Monthly distribution column chart.
 *
 * Plots the per-month distribution over the 36-month forward window (the cash
 * schedule is forward-only — no trailing history). Pure presentation.
 */

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const compact = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
};

const tickMonth = (ym: string): string => (ym.endsWith('-01') ? ym.slice(0, 4) : '');

export function DistributionChart({
  data,
  seriesLabel,
}: {
  data: Array<{ month: string; value: number }>;
  seriesLabel: string;
}) {
  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid
            strokeDasharray="2 4"
            stroke="var(--color-border-subtle)"
            vertical={false}
          />
          <XAxis
            dataKey="month"
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
            formatter={(v: number | string) => [
              typeof v === 'number' ? compact(v) : String(v),
              seriesLabel,
            ]}
            labelStyle={{ color: 'var(--color-text-primary)', fontSize: 12 }}
            contentStyle={{
              background: 'var(--color-surface-base)',
              border: 'var(--ja-card-border)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar
            dataKey="value"
            name={seriesLabel}
            fill="var(--color-accent, #0D0D0D)"
            fillOpacity={0.85}
            radius={[3, 3, 0, 0]}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
