/**
 * KPIStrip
 * --------
 * A responsive CSS grid row of KPITile components.
 *
 * Columns:
 *   - Default: 4 (accepts 3–6 via `columns` prop)
 *   - ≤ 720px: 2 columns
 *   - ≤ 480px: 1 column
 *
 * The strip is purely a layout shell — children are expected to be <KPITile>
 * nodes, but any ReactNode is accepted.
 *
 * @example
 * <KPIStrip columns={4}>
 *   <KPITile label="Revenue"    value="$2.4M" />
 *   <KPITile label="Units Sold" value="1,842" />
 *   <KPITile label="Occupancy"  value="94%" />
 *   <KPITile label="NOI"        value="$580K" />
 * </KPIStrip>
 */

import React, { forwardRef, type ReactNode, type CSSProperties } from 'react';
import './data.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KPIStripProps {
  /** KPITile nodes (or any ReactNode) */
  children: ReactNode;
  /**
   * Number of equal-width columns in the grid.
   * Accepts 3–6. Defaults to 4.
   * The responsive breakpoints (720px → 2col, 480px → 1col) are always applied
   * via the CSS class; this prop only controls the desktop column count.
   */
  columns?: 3 | 4 | 5 | 6;
  /** Additional class names */
  className?: string;
  /** Inline style overrides */
  style?: CSSProperties;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const KPIStrip = forwardRef<HTMLDivElement, KPIStripProps>(
  ({ children, columns = 4, className, style, ...rest }, ref) => {
    const clampedCols = Math.min(6, Math.max(3, columns)) as 3 | 4 | 5 | 6;

    const stripClass = ['ja-kpi-strip', className].filter(Boolean).join(' ');

    // The CSS class handles responsive behaviour;
    // --ja-kpi-strip-cols drives the desktop grid-template-columns.
    const inlineStyle: CSSProperties = {
      '--ja-kpi-strip-cols': clampedCols,
      ...style,
    } as CSSProperties;

    return (
      <div
        ref={ref}
        className={stripClass}
        style={inlineStyle}
        role="list"
        aria-label="KPI metrics"
        {...rest}
      >
        {children}
      </div>
    );
  }
);

KPIStrip.displayName = 'KPIStrip';

export default KPIStrip;
