/**
 * Sparkline
 * ---------
 * A tiny SVG line chart for embedding inside KPI tiles, table cells, or any
 * compact context.
 *
 * Pure SVG implementation — no external charting library required.
 * Data points are normalised into the SVG viewBox so the line always fills
 * the available height.
 *
 * Stroke colours:
 *   - default  → #4F6FFF (blue, matches chart token)
 *   - positive → #15803D (green)
 *   - negative → #B91C1C (red)
 *
 * When `fill` is true, a soft gradient fills the area below the line at 8%
 * opacity (matches chart.fill.opacity token).
 *
 * Edge cases:
 *   - Empty or single-point data arrays render nothing.
 *   - Constant data (all values equal) renders a flat midline.
 *
 * @example
 * <Sparkline data={[12, 18, 14, 22, 20, 26]} variant="positive" fill />
 * <Sparkline data={revenue} width={100} height={28} />
 */

import React, { forwardRef, useMemo, useId } from 'react';
import './data.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SparklineProps {
  /** Array of numeric data points */
  data: number[];
  /** SVG width in pixels — defaults to 80 */
  width?: number;
  /** SVG height in pixels — defaults to 24 */
  height?: number;
  /** Stroke colour variant */
  variant?: 'default' | 'positive' | 'negative';
  /**
   * When true, renders a soft gradient fill below the line at 8% opacity.
   */
  fill?: boolean;
  /** Additional class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Reference CSS vars from tokens.css per CLAUDE.md §9.3 — no hex literals in TS.
// SVG stroke + fill attributes accept var() values in modern browsers.
const STROKE_COLORS: Record<NonNullable<SparklineProps['variant']>, string> = {
  default: 'var(--color-accent-blue)',
  positive: 'var(--color-positive)',
  negative: 'var(--color-negative)',
};

const STROKE_WIDTH = 1.5;
/** Vertical padding inside the viewBox so the stroke is never clipped */
const V_PAD = STROKE_WIDTH;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise data into SVG coordinate pairs */
function buildPoints(data: number[], width: number, height: number): string {
  if (data.length < 2) return '';

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1; // avoid division by zero for flat data

  const usableH = height - V_PAD * 2;
  const stepX = width / (data.length - 1);

  return data
    .map((v, i) => {
      const x = i * stepX;
      // Invert Y: SVG 0 is top, data max should be top
      const y = V_PAD + usableH - ((v - min) / range) * usableH;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Sparkline = forwardRef<SVGSVGElement, SparklineProps>(
  (
    { data, width = 80, height = 24, variant = 'default', fill = false, className, ...rest },
    ref
  ) => {
    // Stable unique id for the gradient definition
    const uid = useId();
    const gradientId = `ja-spark-grad-${uid.replace(/:/g, '')}`;
    const color = STROKE_COLORS[variant];

    const points = useMemo(() => buildPoints(data, width, height), [data, width, height]);

    // Not enough data to draw a line
    if (!points) return null;

    const svgClass = ['ja-sparkline', className].filter(Boolean).join(' ');

    // Build fill polygon: close the path along the bottom edge
    const fillPoints = fill
      ? (() => {
          const lastX = ((data.length - 1) * width) / (data.length - 1);
          return `${points} ${lastX.toFixed(2)},${height} 0,${height}`;
        })()
      : null;

    return (
      <svg
        ref={ref}
        className={svgClass}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Sparkline chart"
        {...rest}
      >
        {fill && (
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.08" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
        )}

        {/* Gradient fill area */}
        {fill && fillPoints && <polygon points={fillPoints} fill={`url(#${gradientId})`} />}

        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }
);

Sparkline.displayName = 'Sparkline';

export default Sparkline;
