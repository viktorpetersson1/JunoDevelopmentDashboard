'use client';

/**
 * V4.6b — Sensitivity heatmap grid (INVENTORY §20).
 *
 * HTML table with cells colored by profit. Y axis = build cost ×,
 * X axis = sale price ×. Color scale runs red (worst) → neutral
 * (median) → green (best). Base case cell (×1.0, ×1.0) gets an
 * outline so the user can locate "today" on the grid.
 *
 * Rendering as an HTML table (not recharts) for two reasons:
 *   1. Recharts has no native heatmap component; libraries that do
 *      add a heavy dep for one chart
 *   2. The grid is small (6×6) so plain HTML + CSS does the job with
 *      zero JS interactivity overhead
 *
 * Hovering a cell shows the exact PBT in the tooltip via `title`.
 */

import type { HeatmapReport } from '@/lib/calc/sensitivity/heatmap';

interface Props {
  report: HeatmapReport;
}

const compact = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
  return `${sign}$${abs.toFixed(0)}`;
};

const full = (n: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

/**
 * Map a profit value to a CSS color on a red-yellow-green diverging scale.
 * Midpoint of the range maps to neutral; left half to red, right half to green.
 * Uses HSL so the gradient stays perceptually smooth.
 */
function colorFor(pbt: number, minPbt: number, maxPbt: number): string {
  if (maxPbt <= minPbt) return 'hsl(60, 30%, 95%)';
  const t = (pbt - minPbt) / (maxPbt - minPbt); // 0..1
  // Hue: 0 (red) at t=0, 60 (yellow) at t=0.5, 120 (green) at t=1
  const hue = t * 120;
  // Lighter at the extremes so text stays readable; saturate the middle band a bit.
  const saturation = 55;
  const lightness = 90 - Math.abs(t - 0.5) * 20; // 90 at extremes, 80 in the middle
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export function HeatmapGrid({ report }: Props) {
  const { cells, buildAxis, saleAxis, minPbt, maxPbt, basePbt } = report;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          borderCollapse: 'separate',
          borderSpacing: 2,
          fontSize: 12,
          fontVariantNumeric: 'tabular-nums',
          margin: '0 auto',
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                padding: '6px 10px',
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-text-tertiary)',
                textAlign: 'right',
              }}
            >
              build × <span aria-hidden="true">↓</span> / sale × <span aria-hidden="true">→</span>
            </th>
            {saleAxis.values.map((sx) => (
              <th
                key={sx}
                style={{
                  padding: '6px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  textAlign: 'center',
                }}
              >
                ×{sx.toFixed(2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cells.map((row, i) => {
            const buildMul = buildAxis.values[i]!;
            return (
              <tr key={i}>
                <th
                  style={{
                    padding: '6px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--color-text-secondary)',
                    textAlign: 'right',
                  }}
                >
                  ×{buildMul.toFixed(2)}
                </th>
                {row.map((c, j) => {
                  const isBase = c.buildMul === 1 && c.saleMul === 1;
                  return (
                    <td
                      key={j}
                      title={`Build ×${c.buildMul.toFixed(2)} · Sale ×${c.saleMul.toFixed(2)} → ${full(c.pbt)}`}
                      style={{
                        padding: '14px 12px',
                        textAlign: 'center',
                        background: colorFor(c.pbt, minPbt, maxPbt),
                        color: 'var(--color-text-primary)',
                        fontWeight: isBase ? 700 : 500,
                        border: isBase
                          ? '2px solid var(--color-accent-base, #131313)'
                          : '1px solid var(--color-border-hairline)',
                        borderRadius: 6,
                        minWidth: 72,
                      }}
                    >
                      {compact(c.pbt)}
                      {isBase && (
                        <div
                          style={{
                            fontSize: 9,
                            color: 'var(--color-text-tertiary)',
                            marginTop: 2,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            fontWeight: 600,
                          }}
                        >
                          base
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 12, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        <span>Profit (pre-tax):</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: colorFor(minPbt, minPbt, maxPbt), border: '1px solid var(--color-border-hairline)' }} />
          {compact(minPbt)}
        </span>
        <span>→</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: colorFor(basePbt, minPbt, maxPbt), border: '1px solid var(--color-border-hairline)' }} />
          {compact(basePbt)} (base)
        </span>
        <span>→</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: colorFor(maxPbt, minPbt, maxPbt), border: '1px solid var(--color-border-hairline)' }} />
          {compact(maxPbt)}
        </span>
      </div>
    </div>
  );
}
