/**
 * Table
 * -----
 * A data table primitive with a fully typed column definition API.
 *
 * Features:
 *   - Sticky `<thead>` on #FAFAF8 background, 11px secondary uppercase headers
 *   - Row height 44px (normal) / 36px (compact), hairline row dividers
 *   - Right-aligned numeric columns with tabular-nums applied automatically
 *   - Row hover on interactive rows
 *   - Custom cell `render` functions per column
 *   - Empty-state slot
 *   - Full ARIA table / row / columnheader / cell semantics
 *
 * @example
 * <Table
 *   columns={[
 *     { key: 'name', header: 'Project' },
 *     { key: 'budget', header: 'Budget', align: 'right' },
 *     { key: 'status', header: 'Status', render: (row) => <Status state={row.status} label={row.statusLabel} /> },
 *   ]}
 *   rows={projects}
 *   getRowKey={(row) => row.id}
 *   onRowClick={(row) => navigate(`/projects/${row.id}`)}
 * />
 */

import React, { forwardRef, type ReactNode } from 'react';
import { TableRow } from './TableRow';
import './data.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TableColumn<TRow = Record<string, unknown>> {
  /** Unique key — also used as the default cell accessor (row[key]) */
  key: string;
  /** Column header label */
  header: string;
  /** Horizontal alignment of cells in this column */
  align?: 'left' | 'right';
  /** Fixed column width (CSS value or pixel number) */
  width?: string | number;
  /**
   * Custom cell renderer. Receives the full row object.
   * If omitted, renders `row[key]` as a string.
   */
  render?: (row: TRow) => ReactNode;
}

export interface TableProps<TRow = Record<string, unknown>> {
  /** Column definitions */
  columns: TableColumn<TRow>[];
  /** Array of row data objects */
  rows: TRow[];
  /** Derive a unique string key for each row (used as React key) */
  getRowKey: (row: TRow) => string;
  /** Optional row click handler — activates hover state on rows */
  onRowClick?: (row: TRow) => void;
  /**
   * Row density:
   * - `normal` — 44px data rows, 36px header (default)
   * - `compact` — 36px data rows, 32px header
   */
  density?: 'normal' | 'compact';
  /** Content to show when `rows` is empty */
  empty?: ReactNode;
  /** Additional class names on the outer wrapper */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a CSS width value from a string or number */
function resolveWidth(w: string | number | undefined): string | undefined {
  if (w === undefined) return undefined;
  if (typeof w === 'number') return `${w}px`;
  return w;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function TableInner<TRow = Record<string, unknown>>(
  {
    columns,
    rows,
    getRowKey,
    onRowClick,
    density = 'normal',
    empty,
    className,
    ...rest
  }: TableProps<TRow>,
  ref: React.ForwardedRef<HTMLDivElement>
) {
  const wrapClass = [
    'ja-table-wrap',
    density === 'compact' ? 'ja-table--compact' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={ref} className={wrapClass} {...rest}>
      <table className="ja-table" role="table" aria-rowcount={rows.length}>
        {/* ---- Header ---- */}
        <thead className="ja-table__head" role="rowgroup">
          <tr role="row">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                role="columnheader"
                className={[
                  'ja-table__th',
                  col.align === 'right' ? 'ja-table__th--right' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ width: resolveWidth(col.width) }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>

        {/* ---- Body ---- */}
        <tbody className="ja-table__body" role="rowgroup">
          {rows.length === 0 ? (
            <tr role="row">
              <td
                className="ja-table__empty"
                colSpan={columns.length}
                role="cell"
              >
                {empty ?? 'No data'}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <TableRow
                key={getRowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                aria-rowindex={rowIndex + 2} /* +2: 1-indexed, header is row 1 */
              >
                {columns.map((col) => {
                  const isNumeric = col.align === 'right';
                  const cellClass = [
                    'ja-table__td',
                    isNumeric ? 'ja-table__td--right' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  const cellValue = col.render
                    ? col.render(row)
                    : (row as Record<string, unknown>)[col.key];

                  // Defensive: cellValue is unknown; React accepts ReactNode.
                  // If a renderer is omitted, treat the value as a string-ish.
                  const cellNode =
                    cellValue == null
                      ? null
                      : typeof cellValue === 'object'
                        ? (cellValue as ReactNode)
                        : String(cellValue);

                  return (
                    <td
                      key={col.key}
                      className={cellClass}
                      role="cell"
                      style={{ width: resolveWidth(col.width) }}
                    >
                      {cellNode}
                    </td>
                  );
                })}
              </TableRow>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// forwardRef + generic component dance.
// Cast is necessary because forwardRef erases generics — the public type
// re-introduces TRow so consumers get inference back.
export const Table = forwardRef(TableInner) as <TRow = Record<string, unknown>>(
  props: TableProps<TRow> & { ref?: React.ForwardedRef<HTMLDivElement> }
) => ReturnType<typeof TableInner>;

(Table as unknown as { displayName: string }).displayName = 'Table';

export default Table;
