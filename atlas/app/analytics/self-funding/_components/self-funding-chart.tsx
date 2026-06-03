'use client';

/**
 * V6.2 T123 — Self-funding trajectory chart.
 *
 * Side-by-side bars per fiscal year: retained NPAT vs equity need. A vertical
 * reference line marks the self-funding year (first FY retained ≥ need). Pure
 * presentation — reads the buildSelfFundingTrajectory output.
 */

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SelfFundingResult } from '@/lib/treasury/self-funding';

const compact = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
};

export function SelfFundingChart({ result }: { result: SelfFundingResult }) {
  const fys = Object.keys(result.annual_equity_need).sort();
  const data = fys.map((fy) => ({
    fy,
    retained: Math.round(result.annual_retained_npat[fy] ?? 0),
    need: Math.round(result.annual_equity_need[fy] ?? 0),
  }));

  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }} barGap={4}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--color-border-subtle)" vertical={false} />
          <XAxis
            dataKey="fy"
            tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }}
            stroke="var(--color-border-hairline)"
          />
          <YAxis
            tickFormatter={compact}
            tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
            stroke="var(--color-border-hairline)"
            width={56}
          />
          <Tooltip
            formatter={(v: number | string, name) => [
              typeof v === 'number' ? compact(v) : String(v),
              name === 'retained' ? 'Retained NPAT' : 'Equity need',
            ]}
            labelStyle={{ color: 'var(--color-text-primary)', fontSize: 12 }}
            contentStyle={{
              background: 'var(--color-surface-base)',
              border: 'var(--ja-card-border)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            formatter={(v) => (v === 'retained' ? 'Retained NPAT' : 'Equity need')}
          />
          {result.self_funding_year && (
            <ReferenceLine
              x={result.self_funding_year}
              stroke="var(--color-positive, #15803d)"
              strokeDasharray="4 4"
              label={{
                value: 'Self-funding',
                position: 'top',
                fontSize: 10,
                fill: 'var(--color-positive, #15803d)',
              }}
            />
          )}
          <Bar dataKey="retained" name="retained" fill="var(--color-positive, #15803d)" fillOpacity={0.8} radius={[3, 3, 0, 0]} />
          <Bar dataKey="need" name="need" fill="var(--color-text-tertiary, #9ca3af)" fillOpacity={0.7} radius={[3, 3, 0, 0]} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
