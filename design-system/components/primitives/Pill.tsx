/**
 * Pill — Juno Atlas primitive
 *
 * Small inline badge for status, category, or metric labels.
 * 11px font, letter-spacing −0.005em, capsule shape.
 *
 * Variants map to semantic meaning:
 *   - `positive` : green — on-track, healthy, approved
 *   - `warning`  : amber — at-risk, pending, review
 *   - `negative` : red — overdue, blocked, failed
 *   - `info`     : blue — informational, draft
 *   - `muted`    : grey — inactive, planning, neutral
 *
 * @example
 * <Pill variant="positive">On Track</Pill>
 * <Pill variant="warning" dot>At Risk</Pill>
 * <Pill variant="negative">Blocked</Pill>
 */

import React, { HTMLAttributes } from 'react';
import './primitives.css';

export type PillVariant = 'positive' | 'warning' | 'negative' | 'info' | 'muted';

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  /** Semantic colour variant */
  variant?: PillVariant;
  /** Show the coloured status dot before the label */
  dot?: boolean;
  children: React.ReactNode;
}

export const Pill: React.FC<PillProps> = ({
  variant = 'muted',
  dot = false,
  children,
  className = '',
  ...rest
}) => {
  const classes = [
    'ja-pill',
    `ja-pill--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} {...rest}>
      {dot && <span className="ja-pill__dot" aria-hidden="true" />}
      {children}
    </span>
  );
};

export default Pill;
