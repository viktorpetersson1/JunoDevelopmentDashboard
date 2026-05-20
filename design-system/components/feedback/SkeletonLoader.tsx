/**
 * SkeletonLoader — Juno Atlas feedback layer
 *
 * Placeholder shimmer shown while data is fetching. Uses a CSS gradient
 * sweep animation that respects `prefers-reduced-motion` (static muted
 * block when reduced motion is preferred).
 *
 * Variants:
 * - `text`   — single text line (default 14px height)
 * - `rect`   — generic rectangle
 * - `circle` — circular avatar placeholder
 * - `kpi`    — composed label (10×80) + value (28×140) pair
 * - `row`    — full-width table row (44px height)
 *
 * When `count` > 1 the skeleton is repeated in a vertical stack with 8px gap.
 *
 * @example
 * ```tsx
 * import { SkeletonLoader } from '@juno-atlas/components/feedback';
 *
 * // Three text lines
 * <SkeletonLoader variant="text" count={3} />
 *
 * // Rectangle placeholder (e.g. a chart area)
 * <SkeletonLoader variant="rect" width="100%" height={260} />
 *
 * // Avatar
 * <SkeletonLoader variant="circle" width={32} height={32} />
 *
 * // KPI tile
 * <SkeletonLoader variant="kpi" />
 *
 * // Table rows
 * <SkeletonLoader variant="row" count={5} />
 * ```
 */

import React, { forwardRef } from 'react';
import './feedback.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SkeletonVariant = 'text' | 'rect' | 'circle' | 'kpi' | 'row';

export interface SkeletonLoaderProps {
  /** Shape / semantic variant */
  variant: SkeletonVariant;
  /** CSS width value or px number. Defaults depend on variant. */
  width?: string | number;
  /** CSS height value or px number. Defaults depend on variant. */
  height?: string | number;
  /** Repeat count — renders multiple skeletons in a vertical stack */
  count?: number;
  /** Additional className for the root element */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toCSSValue(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'number' ? `${value}px` : value;
}

interface SingleSkeletonProps {
  variant: SkeletonVariant;
  width?: string | number;
  height?: string | number;
}

function SingleSkeleton({ variant, width, height }: SingleSkeletonProps) {
  const w = toCSSValue(width);
  const h = toCSSValue(height);

  // --- kpi: composite label + value ---
  if (variant === 'kpi') {
    return (
      <span className="ja-skeleton ja-skeleton--kpi" aria-hidden="true">
        <span className="ja-skeleton__kpi-label" />
        <span className="ja-skeleton__kpi-value" />
      </span>
    );
  }

  // --- row: full-width table-row height ---
  if (variant === 'row') {
    return (
      <span
        className="ja-skeleton ja-skeleton--row"
        style={{
          width: w ?? '100%',
          height: h ?? '44px',
        }}
        aria-hidden="true"
      />
    );
  }

  // --- circle ---
  if (variant === 'circle') {
    const size = w ?? h ?? '32px';
    return (
      <span
        className="ja-skeleton ja-skeleton--circle"
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }

  // --- text ---
  if (variant === 'text') {
    return (
      <span
        className="ja-skeleton ja-skeleton--text"
        style={{
          width: w ?? '100%',
          ...(h ? { height: h } : {}),
        }}
        aria-hidden="true"
      />
    );
  }

  // --- rect (default) ---
  return (
    <span
      className="ja-skeleton ja-skeleton--rect"
      style={{
        width: w ?? '100%',
        height: h ?? '16px',
      }}
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SkeletonLoader = forwardRef<HTMLDivElement, SkeletonLoaderProps>(
  ({ variant, width, height, count = 1, className }, ref) => {
    if (count <= 1) {
      // Single — no wrapper div needed
      return (
        <div
          ref={ref}
          className={className}
          role="status"
          aria-label="Loading…"
          aria-busy="true"
        >
          <SingleSkeleton variant={variant} width={width} height={height} />
        </div>
      );
    }

    // Multiple — stacked group
    return (
      <div
        ref={ref}
        className={['ja-skeleton-group', className].filter(Boolean).join(' ')}
        role="status"
        aria-label="Loading…"
        aria-busy="true"
      >
        {Array.from({ length: count }, (_, i) => (
          <SingleSkeleton
            key={i}
            variant={variant}
            width={width}
            height={height}
          />
        ))}
      </div>
    );
  },
);

SkeletonLoader.displayName = 'SkeletonLoader';
export default SkeletonLoader;
