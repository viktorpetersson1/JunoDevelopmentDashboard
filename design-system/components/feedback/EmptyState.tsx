/**
 * EmptyState — Juno Atlas feedback layer
 *
 * Centered placeholder for lists, cards, and views that have no data.
 * Supports an icon, heading, description, and a single CTA action.
 *
 * @example
 * ```tsx
 * import { EmptyState } from '@juno-atlas/components/feedback';
 *
 * // Inside a card or table area:
 * <EmptyState
 *   icon={
 *     <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
 *          stroke="currentColor" strokeWidth={1.5}>
 *       <path d="M3 9l9-6 9 6v12H3V9z"/>
 *       <path d="M9 21V12h6v9"/>
 *     </svg>
 *   }
 *   title="No projects yet"
 *   description="Create your first project to start tracking IRR, capital, and risks."
 *   action={{ label: 'New project', onClick: () => openWizard() }}
 * />
 * ```
 */

import React, { forwardRef, type ReactNode } from 'react';
import './feedback.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmptyStateProps {
  /** Optional icon rendered in a muted rounded container */
  icon?: ReactNode;
  /** Primary heading */
  title: string;
  /** Supporting description below the title */
  description?: string;
  /** Single CTA action */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Additional className for the root element */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon, title, description, action, className }, ref) => {
    return (
      <div
        ref={ref}
        className={['ja-empty-state', className].filter(Boolean).join(' ')}
        role="status"
        aria-label={title}
      >
        {icon && (
          <span className="ja-empty-state__icon" aria-hidden="true">
            {icon}
          </span>
        )}

        <h3 className="ja-empty-state__title">{title}</h3>

        {description && (
          <p className="ja-empty-state__description">{description}</p>
        )}

        {action && (
          <button
            type="button"
            className="ja-empty-state__action"
            onClick={action.onClick}
          >
            {action.label}
          </button>
        )}
      </div>
    );
  },
);

EmptyState.displayName = 'EmptyState';
export default EmptyState;
