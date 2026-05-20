/**
 * KPITile
 * -------
 * A single KPI metric block. Displays a label, a large numeric value, an
 * optional delta badge (up / down / flat), an optional hint line, and an
 * optional sparkline slot.
 *
 * Layout: vertical stack, 20px padding, white bg, hairline border, 6px radius.
 * Designed to stretch and fill a grid cell inside <KPIStrip>.
 *
 * @example
 * <KPITile
 *   label="Total Revenue"
 *   value="$2.4M"
 *   delta={{ value: "+12%", direction: "up" }}
 *   hint="vs. prior period"
 *   sparkline={<Sparkline data={[10, 14, 11, 18, 22]} />}
 * />
 */

import React, { forwardRef, ReactNode } from 'react';
import './data.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KPITileDelta {
  /** Display string, e.g. "+12%" or "–3 pts" */
  value: string;
  /** Visual direction of the delta */
  direction: 'up' | 'down' | 'flat';
}

export interface KPITileProps {
  /** Uppercase-style metric label (11px secondary, wide letter-spacing) */
  label: string;
  /** Primary numeric or text value (30px / 500 / -0.04em / tabular-nums) */
  value: string | number;
  /** Optional delta badge rendered as a coloured inline pill */
  delta?: KPITileDelta;
  /** Optional 12px tertiary hint text rendered below the value row */
  hint?: string;
  /** Optional sparkline slot rendered at the bottom of the tile */
  sparkline?: ReactNode;
  /** Additional class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ARROW: Record<KPITileDelta['direction'], string> = {
  up:   '↑',
  down: '↓',
  flat: '→',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const KPITile = forwardRef<HTMLDivElement, KPITileProps>(
  ({ label, value, delta, hint, sparkline, className, ...rest }, ref) => {
    const tileClass = ['ja-kpi-tile', className].filter(Boolean).join(' ');

    return (
      <div ref={ref} className={tileClass} {...rest}>
        {/* Label */}
        <p className="ja-kpi-tile__label" aria-label={label}>
          {label}
        </p>

        {/* Value */}
        <p className="ja-kpi-tile__value" aria-live="polite">
          {value}
        </p>

        {/* Meta row: delta + hint */}
        {(delta || hint) && (
          <div className="ja-kpi-tile__meta">
            {delta && (
              <span
                className={`ja-kpi-tile__delta ja-kpi-tile__delta--${delta.direction}`}
                aria-label={`${delta.direction === 'up' ? 'Up' : delta.direction === 'down' ? 'Down' : 'Flat'} ${delta.value}`}
              >
                <span className="ja-kpi-tile__delta-arrow" aria-hidden="true">
                  {ARROW[delta.direction]}
                </span>
                {delta.value}
              </span>
            )}
            {hint && (
              <span className="ja-kpi-tile__hint">{hint}</span>
            )}
          </div>
        )}

        {/* Sparkline slot */}
        {sparkline && (
          <div className="ja-kpi-tile__sparkline" aria-hidden="true">
            {sparkline}
          </div>
        )}
      </div>
    );
  }
);

KPITile.displayName = 'KPITile';

export default KPITile;
