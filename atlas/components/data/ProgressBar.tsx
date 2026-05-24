/**
 * ProgressBar
 * -----------
 * A horizontal progress indicator with semantic colour variants and two sizes.
 *
 * Fill colours:
 *   - default  → #0D0D0D (dark/neutral)
 *   - positive → #15803D (green)
 *   - warning  → #A16207 (amber)
 *   - negative → #B91C1C (red)
 *
 * Track: #F4F4F2 muted fill, 2px radius.
 *
 * @example
 * <ProgressBar value={72} variant="positive" label="Occupancy" showValue />
 * <ProgressBar value={40} max={200} variant="warning" size="sm" />
 */

import React, { forwardRef } from 'react';
import './data.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProgressBarProps {
  /** Current value (0 – max) */
  value: number;
  /** Maximum value — defaults to 100 */
  max?: number;
  /** Visual colour variant for the fill */
  variant?: 'default' | 'positive' | 'warning' | 'negative';
  /** Track height: sm = 4px, md = 6px */
  size?: 'sm' | 'md';
  /** Optional label rendered above the track */
  label?: string;
  /** Show the numeric percentage to the right of the label */
  showValue?: boolean;
  /** Additional class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
  (
    {
      value,
      max = 100,
      variant = 'default',
      size = 'md',
      label,
      showValue = false,
      className,
      ...rest
    },
    ref
  ) => {
    // Clamp fill percentage to [0, 100]
    const pct = Math.min(100, Math.max(0, (value / max) * 100));

    const wrapClass = ['ja-progress', className].filter(Boolean).join(' ');
    const trackClass = ['ja-progress__track', `ja-progress__track--${size}`].join(' ');
    const fillClass = ['ja-progress__fill', `ja-progress__fill--${variant}`].join(' ');

    const hasHeader = label || showValue;

    return (
      <div
        ref={ref}
        className={wrapClass}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
        {...rest}
      >
        {hasHeader && (
          <div className="ja-progress__header">
            {label && <span className="ja-progress__label">{label}</span>}
            {showValue && <span className="ja-progress__value-text">{Math.round(pct)}%</span>}
          </div>
        )}

        <div className={trackClass}>
          <div className={fillClass} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }
);

ProgressBar.displayName = 'ProgressBar';

export default ProgressBar;
