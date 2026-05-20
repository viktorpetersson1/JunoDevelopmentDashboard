/**
 * FilterChip — Juno Atlas primitive
 *
 * Pill-shaped filter toggle. Default state: white bg, hairline border.
 * Active state: solid black bg, white text. Optional badge count and
 * close (×) affordance when active.
 *
 * Typically rendered in a row of chips above a data table or list to
 * represent selected filter criteria.
 *
 * @example
 * // Basic toggle
 * <FilterChip
 *   label="In Progress"
 *   active={filter === 'in-progress'}
 *   onClick={() => setFilter('in-progress')}
 * />
 *
 * // With badge count and clear
 * <FilterChip
 *   label="Stage"
 *   value={3}
 *   active={stageFilter.length > 0}
 *   onClick={() => setShowStageMenu(true)}
 *   onClear={() => clearStageFilter()}
 * />
 */

import React, { forwardRef, ButtonHTMLAttributes } from 'react';
import './primitives.css';

export interface FilterChipProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  /** Display text of the chip */
  label: string;
  /** Optional numeric badge (e.g., count of active filters) */
  value?: number;
  /** Whether this chip is currently active/selected */
  active?: boolean;
  /** Called when the chip body is clicked */
  onClick?: () => void;
  /** Called when the × clear button is clicked (only shown when active) */
  onClear?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

/** × close icon */
const XIcon = () => (
  <svg
    viewBox="0 0 10 10"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M2 2l6 6M8 2l-6 6" />
  </svg>
);

export const FilterChip = forwardRef<HTMLButtonElement, FilterChipProps>(
  (
    {
      label,
      value,
      active = false,
      onClick,
      onClear,
      className = '',
      disabled,
      ...rest
    },
    ref,
  ) => {
    const classes = [
      'ja-filter-chip',
      active ? 'ja-filter-chip--active' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const showClear = active && onClear;

    return (
      <button
        ref={ref}
        type="button"
        className={classes}
        onClick={onClick}
        disabled={disabled}
        aria-pressed={active}
        {...rest}
      >
        <span>{label}</span>

        {value !== undefined && value > 0 && (
          <span className="ja-filter-chip__badge" aria-label={`${value} selected`}>
            {value}
          </span>
        )}

        {showClear && (
          <button
            type="button"
            className="ja-filter-chip__clear"
            onClick={(e) => {
              e.stopPropagation();
              onClear?.(e);
            }}
            aria-label={`Clear ${label} filter`}
            tabIndex={-1}
          >
            <XIcon />
          </button>
        )}
      </button>
    );
  },
);

FilterChip.displayName = 'FilterChip';

export default FilterChip;
