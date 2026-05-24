/**
 * ListPage
 * --------
 * List / table page pattern. Composes a page header row, a filter-chip toolbar
 * with search and result count, and a data Table below. When `rows` is empty,
 * renders an optional EmptyState slot instead of the table.
 *
 * Used for: Projects list, Risks center, Suggestions, Users table, and any
 * other page whose primary content is a filterable, searchable data table.
 *
 * @example
 * ```tsx
 * <AppShell activeHref="/projects" scenario={scenario} onScenarioChange={setScenario}>
 *   <ListPage
 *     title="Projects"
 *     subtitle="All active and prospective deals"
 *     primaryAction={{ label: 'New project', onClick: openWizard }}
 *     filters={
 *       <>
 *         <FilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
 *         <FilterChip label="Active" active={filter === 'active'} onClick={() => setFilter('active')} />
 *         <FilterChip label="Pre-construction" active={filter === 'pre'} onClick={() => setFilter('pre')} />
 *       </>
 *     }
 *     searchValue={query}
 *     onSearchChange={setQuery}
 *     resultCount={filteredProjects.length}
 *     columns={columns}
 *     rows={filteredProjects}
 *     getRowKey={(r) => r.id}
 *     onRowClick={(r) => navigate(`/projects/${r.id}`)}
 *   />
 * </AppShell>
 * ```
 *
 * @module patterns/ListPage
 */

import React, { type ReactNode } from 'react';
// T008 fix: design-system has `components/primitives/`; atlas calls it `components/ui/`.
import { Button, Input } from '../components/ui';
import { Table } from '../components/data';
import { EmptyState } from '../components/feedback';
import type { TableColumn } from '../components/data';
import type { EmptyStateProps } from '../components/feedback';
import './patterns.css';

// ─── Search Icon ──────────────────────────────────────────────────────────────

const SearchIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    aria-hidden="true"
  >
    <circle cx="6.5" cy="6.5" r="4" />
    <path d="M10 10l3 3" strokeLinecap="round" />
  </svg>
);

// ─── Plus Icon ────────────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M8 3v10M3 8h10" strokeLinecap="round" />
  </svg>
);

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ListPagePrimaryAction {
  /** Button label text */
  label: string;
  /** Click handler */
  onClick: () => void;
  /** Optional icon rendered to the left of the label */
  icon?: ReactNode;
}

export interface ListPageEmptyConfig extends Omit<EmptyStateProps, 'className'> {}

export interface ListPageProps<TRow = Record<string, unknown>> {
  /** Page heading */
  title: string;
  /** Optional descriptor below the heading */
  subtitle?: string;
  /** Primary CTA button in the header (e.g. "New project") */
  primaryAction?: ListPagePrimaryAction;
  /** Filter chip group — render <FilterChip> nodes directly */
  filters?: ReactNode;
  /** Current search query value */
  searchValue?: string;
  /** Called on search input change */
  onSearchChange?: (value: string) => void;
  /** Search input placeholder */
  searchPlaceholder?: string;
  /** Number of records shown after filtering — renders as "N results" */
  resultCount?: number;
  /** Table column definitions */
  columns: TableColumn<TRow>[];
  /** Array of row data */
  rows: TRow[];
  /** Derive a unique string key for each row */
  getRowKey: (row: TRow) => string;
  /** Row click handler */
  onRowClick?: (row: TRow) => void;
  /**
   * EmptyState props shown when rows.length === 0.
   * If omitted, renders the default empty state.
   */
  empty?: ListPageEmptyConfig;
  /** Optional CSS class appended to the root element */
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * List / table page pattern with header, filter toolbar, and data table.
 * Swap in any column/row data without re-building the surrounding chrome.
 */
export function ListPage<TRow = Record<string, unknown>>({
  title,
  subtitle,
  primaryAction,
  filters,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search…',
  resultCount,
  columns,
  rows,
  getRowKey,
  onRowClick,
  empty,
  className,
}: ListPageProps<TRow>) {
  const rootClass = ['ja-list-page', className].filter(Boolean).join(' ');

  const isEmpty = rows.length === 0;

  return (
    <div className={rootClass} aria-labelledby="ja-list-page-title">
      {/* ── Page header ─────────────────────────────── */}
      <div className="ja-list-page__header">
        <div className="ja-list-page__title-group">
          <h1 id="ja-list-page-title" className="ja-list-page__title">
            {title}
          </h1>
          {subtitle && <p className="ja-list-page__subtitle">{subtitle}</p>}
        </div>

        {primaryAction && (
          <div className="ja-list-page__header-actions">
            <Button
              variant="primary"
              size="md"
              iconLeft={primaryAction.icon ?? <PlusIcon />}
              onClick={primaryAction.onClick}
            >
              {primaryAction.label}
            </Button>
          </div>
        )}
      </div>

      {/* ── Filter toolbar ──────────────────────────── */}
      {(filters || onSearchChange !== undefined || resultCount !== undefined) && (
        <div className="ja-list-page__toolbar" role="toolbar" aria-label="Filter and search">
          {/* Filter chips */}
          {filters && <div className="ja-list-page__filters">{filters}</div>}

          {/* Search input */}
          {onSearchChange !== undefined && (
            <div className="ja-list-page__search">
              <Input
                value={searchValue ?? ''}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                iconLeft={<SearchIcon />}
                aria-label="Search records"
              />
            </div>
          )}

          {/* Spacer */}
          <div className="ja-list-page__spacer" aria-hidden="true" />

          {/* Result count */}
          {resultCount !== undefined && (
            <span className="ja-list-page__count" aria-live="polite" aria-atomic="true">
              {resultCount.toLocaleString()} result{resultCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* ── Table or empty state ─────────────────────── */}
      {isEmpty ? (
        <div className="ja-list-page__empty">
          <EmptyState
            title={empty?.title ?? `No ${title.toLowerCase()} yet`}
            description={empty?.description ?? `Add your first item to get started.`}
            action={empty?.action}
            icon={empty?.icon}
          />
        </div>
      ) : (
        <Table columns={columns} rows={rows} getRowKey={getRowKey} onRowClick={onRowClick} />
      )}
    </div>
  );
}

export default ListPage;
