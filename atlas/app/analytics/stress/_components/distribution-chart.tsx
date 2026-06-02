'use client';

/**
 * V4.7 — Distribution histogram (INVENTORY §22).
 *
 * Bins the raw trial outcomes (Sturges' rule for bin count) and plots
 * the resulting frequency distribution. Bars colored red when below 0
 * (the "negativeIsBad" flag controls whether negativity matters — for
 * peak-equity it doesn't).
 *
 * Server passes the raw trial values; client component handles the
 * binning so recharts gets a small, plot-ready dataset.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useMemo } from 'react';

interface Props {
  values: number[];
  valueLabel: string;
  negativeIsBad: boolean;
}

interface Bin {
  /** Center of the bin — used as the x-axis category label. */
  midpoint: number;
  /** Range label e.g. "$1.2M – $1.4M" for the tooltip. */
  range: string;
  count: number;
  /** Cached sign for color decision. */
  midSign: number;
}

const compact = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
  return `${sign}$${abs.toFixed(0)}`;
};

export function DistributionChart({ values, valueLabel, negativeIsBad }: Props) {
  const bins = useMemo(() => buildBins(values), [values]);

  if (bins.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
        Not enough data points to plot.
      </p>
    );
  }

  return (
    <div style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={bins} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--color-border-subtle)" />
          <XAxis
            dataKey="midpoint"
            tickFormatter={compact}
            tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
            stroke="var(--color-border-hairline)"
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
            stroke="var(--color-border-hairline)"
            width={40}
          />
          <Tooltip
            formatter={(v: number | string, _name: string, item: { payload?: Bin }) => [
              `${v} trial${v === 1 ? '' : 's'}`,
              item?.payload?.range ?? valueLabel,
            ]}
            labelFormatter={() => valueLabel}
            contentStyle={{
              background: 'var(--color-surface-base)',
              border: 'var(--ja-card-border)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <ReferenceLine x={0} stroke="var(--color-border-strong)" strokeWidth={1} />
          <Bar dataKey="count" name="Trials">
            {bins.map((b, i) => (
              <Cell
                key={i}
                fill={
                  negativeIsBad && b.midSign < 0
                    ? 'var(--color-negative, #dc2626)'
                    : 'var(--color-accent-base, #131313)'
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Build evenly-spaced bins via Sturges' rule (k = ceil(log2(n) + 1)).
 * Clamps to [6, 24] bins so the chart stays readable.
 */
function buildBins(values: number[]): Bin[] {
  if (values.length < 2) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [];
  const sturges = Math.ceil(Math.log2(values.length) + 1);
  const k = Math.min(24, Math.max(6, sturges));
  const width = (max - min) / k;
  const counts = new Array<number>(k).fill(0);
  for (const v of values) {
    let idx = Math.floor((v - min) / width);
    if (idx >= k) idx = k - 1;
    if (idx < 0) idx = 0;
    counts[idx]! += 1;
  }
  return counts.map((count, i) => {
    const lo = min + i * width;
    const hi = lo + width;
    const midpoint = lo + width / 2;
    return {
      midpoint,
      range: `${compact(lo)} – ${compact(hi)}`,
      count,
      midSign: Math.sign(midpoint),
    };
  });
}
