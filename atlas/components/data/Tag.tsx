/**
 * Tag
 * ---
 * A neutral, purely descriptive inline label tag — e.g. "Hamptons", "Villa",
 * "Q3 2025".
 *
 * Distinct from <Pill>: Tags carry no semantic state; they are purely
 * categorical / descriptive. Pills convey status with colour coding.
 *
 * Design: muted bg (#F4F4F2), secondary text, 4px radius, 11px font,
 * weight 500, no icon.
 *
 * @example
 * <Tag>Hamptons</Tag>
 * <Tag size="sm">Villa</Tag>
 */

import React, { forwardRef, type ReactNode } from 'react';
import './data.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TagProps {
  /** Tag label content */
  children: ReactNode;
  /**
   * Size variant:
   * - `sm` — tighter padding (3px 6px), 11px font
   * - `md` — standard padding (4px 8px), 11px font (default)
   */
  size?: 'sm' | 'md';
  /** Additional class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Tag = forwardRef<HTMLSpanElement, TagProps>(
  ({ children, size = 'md', className, ...rest }, ref) => {
    const tagClass = ['ja-tag', `ja-tag--${size}`, className].filter(Boolean).join(' ');

    return (
      <span ref={ref} className={tagClass} {...rest}>
        {children}
      </span>
    );
  }
);

Tag.displayName = 'Tag';

export default Tag;
