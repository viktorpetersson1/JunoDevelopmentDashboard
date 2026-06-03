'use client';

/**
 * V6.2 T121 — KPC LOC outstanding-balance timeline.
 *
 * Plots `outstanding` over the 36-month window with reference-line annotations
 * at the first-paydown month (line starts coming down) and the full-clearance
 * month (hits $0). Pure presentation — reads the `buildLocRepayment` output.
 */

import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { LocRepayment } from '@/lib/treasury/loc-repayment';

const compact = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
};

const tickMonth = (ym: string): string => (ym.endsWith('-01') ? ym.slice(0, 4) : '');

export function LocRepaymentChart({ repayment }: { repayment: LocRepayment }) {
  const data = repayment.timeline.map((r) => ({
    date: r.month,
    outstanding: r.outstanding,
  }));

  return (
    <div style={{ width: '100%', height: 300 }}>
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
          <ReferenceLine y={0} stroke="var(--color-border-strong)" strokeWidth={1} />
          {repayment.first_paydown_month && (
            <ReferenceLine
              x={repayment.first_paydown_month}
              stroke="var(--color-text-tertiary)"
              strokeDasharray="4 4"
              label={{
                value: 'First paydown',
                position: 'insideTopRight',
                fontSize: 10,
                fill: 'var(--color-text-tertiary)',
              }}
            />
          )}
          {repayment.full_clearance_month && (
            <ReferenceLine
              x={repayment.full_clearance_month}
              stroke="var(--color-positive, #15803d)"
              strokeDasharray="4 4"
              label={{
                value: 'Full clearance',
                position: 'insideTopLeft',
                fontSize: 10,
                fill: 'var(--color-positive, #15803d)',
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="outstanding"
            name="LOC outstanding"
            stroke="var(--color-negative, #dc2626)"
            fill="var(--color-negative, #dc2626)"
            fillOpacity={0.15}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
