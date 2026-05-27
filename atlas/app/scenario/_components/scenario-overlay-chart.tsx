'use client';

/**
 * V4.5c — Multi-scenario overlay charts (INVENTORY §19).
 *
 * One generic component for both "Equity overlay" and "Cash flow
 * overlay" sections — they're identical except for the source series.
 * Renders one line per scenario (base + each saved), with base styled
 * as a dashed reference and saved scenarios as solid colored lines.
 *
 * Recharts LineChart with a hand-picked palette: each saved scenario
 * gets a distinct hue, with the base case always neutral gray-dashed.
 * Caps at 8 saved scenarios to keep colors distinguishable.
 */

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useMemo } from 'react';

interface ScenarioSeries {
  id: string;
  name: string;
  values: number[];
}

interface Props {
  /** Shared timeline (e.g. ['2026-01', '2026-02', ...]). */
  dates: string[];
  /** Base case series — always rendered as dashed gray. */
  baseValues: number[];
  /** Per-saved-scenario series. */
  scenarios: ScenarioSeries[];
  /** Chart height, default 280. */
  height?: number;
  /** Whether the value units are "USD over time" (cumulative drawn) or
   *  "USD per month" (net cash). Affects tooltip formatting / sign-handling. */
  valueKind?: 'cumulative' | 'monthly';
}

/** Distinct hues for up to 8 saved scenarios. Rotates if more. */
const PALETTE = [
  '#15803d', // green
  '#dc2626', // red
  '#2563eb', // blue
  '#a16207', // amber
  '#7c3aed', // violet
  '#0891b2', // cyan
  '#be123c', // rose
  '#16a34a', // green-light
];

const compact = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
  return `${sign}$${abs.toFixed(0)}`;
};

const tickMonth = (ym: string): string => (ym.endsWith('-01') ? ym.slice(0, 4) : '');

export function ScenarioOverlayChart({
  dates,
  baseValues,
  scenarios,
  height = 280,
  valueKind = 'cumulative',
}: Props) {
  // Build a chart-ready dataset: one row per month, one numeric column
  // per scenario (+ base). Recharts wants this row-of-objects shape.
  const data = useMemo(() => {
    return dates.map((d, i) => {
      const row: Record<string, string | number> = { date: d };
      row.Base = baseValues[i] ?? 0;
      for (const s of scenarios) {
        row[s.name] = s.values[i] ?? 0;
      }
      return row;
    });
  }, [dates, baseValues, scenarios]);

  if (data.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
        No data to plot.
      </p>
    );
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
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
          {valueKind === 'monthly' && (
            <ReferenceLine y={0} stroke="var(--color-border-strong)" strokeWidth={1} />
          )}
          <Line
            type="monotone"
            dataKey="Base"
            stroke="var(--color-text-tertiary)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
            name="Base case"
          />
          {scenarios.map((s, i) => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.name}
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
