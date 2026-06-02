'use client';

/**
 * V4.6 — Tornado chart (INVENTORY §20 Sensitivity).
 *
 * Horizontal bars, one per driver. Low case extends left of 0, high
 * case extends right. Bars sorted by magnitude (caller does the sort —
 * we just render in given order, biggest on top).
 *
 * Recharts BarChart with two stacked-but-opposite-signed bars per row.
 * Custom domain so the axis is symmetric around 0 (visual parity).
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
import type { SensitivityDriver } from '@/lib/calc/sensitivity/tornado';

interface Row {
  label: string;
  /** Negative when the low case hurts profit; positive when the low case
   *  is actually the upside (rare — e.g. interest rate "low" means rate
   *  goes UP, hurting profit, so this is negative). */
  low: number;
  high: number;
  lowLabel: string;
  highLabel: string;
}

const compact = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
  return `${sign}$${abs.toFixed(0)}`;
};

export function TornadoChart({ drivers }: { drivers: SensitivityDriver[] }) {
  if (drivers.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
        No drivers to display.
      </p>
    );
  }

  // Reverse for recharts — by default it puts the first data row at the
  // bottom of a horizontal bar chart, but the tornado convention is
  // biggest-mover on top. Reversing the data sorts visually correct.
  const data: Row[] = [...drivers].reverse().map((d) => ({
    label: d.label,
    low: d.lowDelta,
    high: d.highDelta,
    lowLabel: d.lowLabel,
    highLabel: d.highLabel,
  }));

  // Symmetric x-axis around 0 — find the biggest absolute delta.
  const maxAbs = Math.max(...drivers.flatMap((d) => [Math.abs(d.lowDelta), Math.abs(d.highDelta)]));
  const padded = maxAbs * 1.1 || 1;

  // Height: 50px per row + 30px chrome. Keeps readable for 1-8 drivers.
  const height = Math.max(160, data.length * 50 + 50);

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          stackOffset="sign"
          margin={{ top: 8, right: 24, bottom: 8, left: 16 }}
        >
          <CartesianGrid strokeDasharray="2 4" stroke="var(--color-border-subtle)" />
          <XAxis
            type="number"
            domain={[-padded, padded]}
            tickFormatter={compact}
            tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
            stroke="var(--color-border-hairline)"
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fontSize: 12, fill: 'var(--color-text-primary)' }}
            stroke="var(--color-border-hairline)"
            width={110}
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
          <ReferenceLine x={0} stroke="var(--color-border-strong)" strokeWidth={1} />
          {/* Two bars per row, sign-stacked so positives go right of 0 and
              negatives go left. Each bar colored by sign of its value. */}
          <Bar dataKey="low" stackId="x" name="Low case">
            {data.map((r, i) => (
              <Cell
                key={`low-${i}`}
                fill={
                  r.low < 0 ? 'var(--color-negative, #dc2626)' : 'var(--color-positive, #15803d)'
                }
              />
            ))}
          </Bar>
          <Bar dataKey="high" stackId="x" name="High case">
            {data.map((r, i) => (
              <Cell
                key={`high-${i}`}
                fill={
                  r.high < 0 ? 'var(--color-negative, #dc2626)' : 'var(--color-positive, #15803d)'
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
