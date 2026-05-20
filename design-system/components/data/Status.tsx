/**
 * Status
 * ------
 * A status indicator comprising a 6px coloured dot and a text label.
 * Inline-flex with 8px gap. Used to communicate the current state of an
 * entity (project, deal, task, etc.) at a glance.
 *
 * Dot colours:
 *   - positive → #15803D (green)
 *   - warning  → #A16207 (amber)
 *   - negative → #B91C1C (red)
 *   - neutral  → #B0B5BC (muted grey)
 *   - info     → #1E40AF (blue)
 *
 * @example
 * <Status state="positive" label="On Track" />
 * <Status state="warning"  label="Watch" />
 * <Status state="negative" label="At Risk" />
 * <Status state="neutral"  label="Planning" />
 * <Status state="info"     label="In Review" />
 */

import React, { forwardRef } from 'react';
import './data.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StatusState = 'positive' | 'warning' | 'negative' | 'neutral' | 'info';

export interface StatusProps {
  /** Semantic state — drives dot colour */
  state: StatusState;
  /** Human-readable label rendered beside the dot */
  label: string;
  /** Additional class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Accessible state descriptions (for screen readers)
// ---------------------------------------------------------------------------

const STATE_ARIA: Record<StatusState, string> = {
  positive: 'Positive',
  warning:  'Warning',
  negative: 'Negative',
  neutral:  'Neutral',
  info:     'Info',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Status = forwardRef<HTMLSpanElement, StatusProps>(
  ({ state, label, className, ...rest }, ref) => {
    const wrapClass = ['ja-status', className].filter(Boolean).join(' ');

    return (
      <span
        ref={ref}
        className={wrapClass}
        aria-label={`${STATE_ARIA[state]}: ${label}`}
        {...rest}
      >
        <span
          className={`ja-status__dot ja-status__dot--${state}`}
          aria-hidden="true"
        />
        <span className="ja-status__label">{label}</span>
      </span>
    );
  }
);

Status.displayName = 'Status';

export default Status;
