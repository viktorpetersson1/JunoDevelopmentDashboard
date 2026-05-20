/**
 * TableRow
 * --------
 * A standalone table row primitive for cases where consumers compose rows by
 * hand (e.g. expandable rows, nested sub-rows).
 *
 * Renders a `<tr>` element with:
 *   - Bottom hairline divider (via CSS class)
 *   - Hover background when `onClick` is provided
 *   - Selected background state when `selected` is true
 *   - Accessible role="row" / keyboard semantics
 *
 * Also used internally by <Table> for each data row.
 *
 * @example
 * <TableRow onClick={() => openDetail(row)} selected={isSelected}>
 *   <td className="ja-table__td">Hamptons Villa</td>
 *   <td className="ja-table__td ja-table__td--right">$4.2M</td>
 * </TableRow>
 */

import React, { forwardRef, ReactNode, KeyboardEvent } from 'react';
import './data.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TableRowProps {
  /** Table cells (`<td>` elements, usually `ja-table__td` class) */
  children: ReactNode;
  /** Click handler — also marks the row as interactive (hover state, pointer cursor) */
  onClick?: () => void;
  /** Highlight the row as selected */
  selected?: boolean;
  /** Additional class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TableRow = forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ children, onClick, selected, className, ...rest }, ref) => {
    const isInteractive = Boolean(onClick);

    const rowClass = [
      'ja-table__row',
      isInteractive ? 'ja-table__row--interactive' : '',
      selected ? 'ja-table__row--selected' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const handleKeyDown = (e: KeyboardEvent<HTMLTableRowElement>) => {
      if (onClick && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onClick();
      }
    };

    return (
      <tr
        ref={ref}
        className={rowClass}
        role="row"
        onClick={onClick}
        onKeyDown={isInteractive ? handleKeyDown : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        aria-selected={selected}
        {...rest}
      >
        {children}
      </tr>
    );
  }
);

TableRow.displayName = 'TableRow';

export default TableRow;
