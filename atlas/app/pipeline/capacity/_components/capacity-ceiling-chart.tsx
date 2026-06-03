'use client';

/**
 * V6.2 T122 — Concurrent-projects ceiling chart.
 *
 * Plots concurrent active projects (drawing on the KPC LOC) per month against
 * the covenant ceiling (a flat reference line). The gap between the line and
 * the ceiling is the available start capacity. Pure presentation.
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

export interface CapacityPoint {
  month: string;
  concurrent: number;
}

const tickMonth = (ym: string): string => (ym.endsWith('-01') ? ym.slice(0, 4) : '');

export function CapacityCeilingChart({
  points,
  ceiling,
  nextAvailableMonth,
}: {
  points: CapacityPoint[];
  ceiling: number;
  nextAvailableMonth: string | null;
}) {
  const data = points.map((p) => ({ date: p.month, concurrent: p.concurrent }));
  // Y axis tops out a little above the ceiling so the cap line is always visible.
  const yMax = Math.max(ceiling + 1, ...points.map((p) => p.concurrent)) + 0.5;

  return (
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
            allowDecimals={false}
            domain={[0, yMax]}
            tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
            stroke="var(--color-border-hairline)"
            width={32}
          />
          <Tooltip
            labelStyle={{ color: 'var(--color-text-primary)', fontSize: 12 }}
            contentStyle={{
              background: 'var(--color-surface-base)',
              border: 'var(--ja-card-border)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <ReferenceLine
            y={ceiling}
            stroke="var(--color-negative, #dc2626)"
            strokeWidth={1.5}
            strokeDasharray="6 4"
            label={{
              value: `Covenant cap ${ceiling}`,
              position: 'insideTopRight',
              fontSize: 10,
              fill: 'var(--color-negative, #dc2626)',
            }}
          />
          {nextAvailableMonth && (
            <ReferenceLine
              x={nextAvailableMonth}
              stroke="var(--color-positive, #15803d)"
              strokeDasharray="4 4"
              label={{
                value: 'Next start',
                position: 'insideTopLeft',
                fontSize: 10,
                fill: 'var(--color-positive, #15803d)',
              }}
            />
          )}
          <Area
            type="stepAfter"
            dataKey="concurrent"
            name="Concurrent projects"
            stroke="var(--color-accent, #0D0D0D)"
            fill="var(--color-accent, #0D0D0D)"
            fillOpacity={0.12}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
