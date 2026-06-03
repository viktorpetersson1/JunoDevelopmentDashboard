'use client';

/**
 * Client side of the Projects list surface — table / map / timeline views.
 *
 * Receives pre-fetched projects + their KPIs from the Server Component
 * above; owns filter + search + view toggle + sort state + tile-click navigation.
 *
 * Views:
 *  - table    — sortable table (default)
 *  - map      — placeholder until MapLibre GL ships in V6.1 v2
 *  - timeline — div-based Gantt bars
 *
 * Filtering is client-side for P0 (~10 projects). At >100 projects the
 * filter chips + search box should re-fetch via URL params instead.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FilterChip } from '@/components/ui/FilterChip';
import { Button } from '@/components/ui/Button';
import { DashboardShell } from '@/app/_components/dashboard-shell';
import { getCommitmentTier } from '@/lib/projects/commitment-tier';
import type { SidebarUser } from '@/components/layout';

export interface ProjectRowVM {
  id: string;
  name: string;
  address: string | null;
  stage: string;
  status: string;
  market: string;
  total_sales: number; // dollars
  gross_profit: number; // dollars
  margin_pct: number;
  sale_price_per_sqft_override?: number | null;
  start_date?: string | null;
  sale_date?: string | null;
}

const STAGE_FILTERS: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'tbc', label: 'TBC' },
  { id: 'sourcing', label: 'Sourcing' },
  { id: 'pre_construction', label: 'Pre-construction' },
  { id: 'construction', label: 'Construction' },
  { id: 'pre_sales', label: 'Pre-sales' },
  { id: 'under_contract', label: 'Under contract' },
];

// Stage → bar color for timeline
const STAGE_COLORS: Record<string, string> = {
  tbc: 'var(--color-border-hairline, #c8c8c5)',
  sourcing: 'var(--color-amber-bg, #fef3c7)',
  pre_construction: '#bfdbfe',
  construction: '#93c5fd',
  pre_sales: '#a5f3fc',
  under_contract: 'var(--color-success-bg, #dcfce7)',
};

const TABLE_COLUMNS: { id: string; label: string; numeric?: boolean }[] = [
  { id: 'name', label: 'Project' },
  { id: 'stage', label: 'Stage' },
  { id: 'sale_price_per_sqft_override', label: '$/sqft target', numeric: true },
  { id: 'total_sales', label: 'Total revenue', numeric: true },
  { id: 'margin_pct', label: 'Margin', numeric: true },
  { id: 'sale_month', label: 'Sale month' },
  { id: 'owner', label: 'Owner' },
];

function prettyStage(stage: string): string {
  return stage.replaceAll('_', ' ');
}

function compact(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
  return '$' + (n / 1_000).toFixed(0) + 'k';
}

function marginColor(margin: number): string {
  if (margin >= 0.2) return 'var(--color-positive, #15803d)';
  if (margin >= 0.1) return 'var(--color-warning, #a16207)';
  return 'var(--color-negative, #b91c1c)';
}

const card: React.CSSProperties = {
  background: 'var(--color-surface-raised, #fff)',
  border: '1px solid var(--color-border-hairline, #c8c8c5)',
  borderRadius: 'var(--ja-card-radius)',
};

// ────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────

export function ProjectsListClient({
  rows: initialRows,
  user,
  isEditor = false,
}: {
  rows: ProjectRowVM[];
  user: SidebarUser;
  isEditor?: boolean;
}) {
  const router = useRouter();
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [query, setQuery] = useState<string>('');

  const [view, setView] = useState<'table' | 'map' | 'timeline'>(() => {
    try {
      return (
        (localStorage.getItem('juno_atlas_projects_view') as 'table' | 'map' | 'timeline') ||
        'table'
      );
    } catch {
      return 'table';
    }
  });

  function switchView(v: 'table' | 'map' | 'timeline') {
    setView(v);
    try {
      localStorage.setItem('juno_atlas_projects_view', v);
    } catch {}
  }

  const [sortCol, setSortCol] = useState<string>('total_sales');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function handleSortCol(col: string) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  }

  const rows = useMemo(() => {
    let r = initialRows;
    if (stageFilter !== 'all') {
      r = r.filter((p) => p.stage === stageFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      r = r.filter(
        (p) => p.name.toLowerCase().includes(q) || (p.address ?? '').toLowerCase().includes(q)
      );
    }

    if (view === 'table') {
      // Sort by chosen column
      return [...r].sort((a, b) => {
        let aVal: number | string = 0;
        let bVal: number | string = 0;
        switch (sortCol) {
          case 'name':
            aVal = a.name.toLowerCase();
            bVal = b.name.toLowerCase();
            break;
          case 'stage':
            aVal = a.stage;
            bVal = b.stage;
            break;
          case 'sale_price_per_sqft_override':
            aVal = a.sale_price_per_sqft_override ?? 0;
            bVal = b.sale_price_per_sqft_override ?? 0;
            break;
          case 'total_sales':
            aVal = a.total_sales;
            bVal = b.total_sales;
            break;
          case 'margin_pct':
            aVal = a.margin_pct;
            bVal = b.margin_pct;
            break;
          default:
            aVal = 0;
            bVal = 0;
        }
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortDir === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        }
        return sortDir === 'asc'
          ? (aVal as number) - (bVal as number)
          : (bVal as number) - (aVal as number);
      });
    }

    // For map / timeline: committed first, then by total_sales
    return [...r].sort((a, b) => {
      const aCommitted = getCommitmentTier(a) === 'committed' ? 1 : 0;
      const bCommitted = getCommitmentTier(b) === 'committed' ? 1 : 0;
      if (aCommitted !== bCommitted) return bCommitted - aCommitted;
      return b.total_sales - a.total_sales;
    });
  }, [initialRows, stageFilter, query, view, sortCol, sortDir]);

  const viewBtnBase: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    padding: '5px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    border: '1px solid var(--color-border-hairline, #c8c8c5)',
    fontFamily: 'inherit',
    transition: 'background 120ms ease, border-color 120ms ease',
  };

  function viewBtnStyle(v: 'table' | 'map' | 'timeline'): React.CSSProperties {
    const active = view === v;
    return {
      ...viewBtnBase,
      background: active ? 'var(--color-accent-lime, #ddec65)' : 'transparent',
      fontWeight: active ? 700 : 500,
      color: active ? 'var(--color-text-primary, #111)' : 'var(--color-text-secondary, #6b7280)',
      borderColor: active
        ? 'var(--color-accent-lime, #ddec65)'
        : 'var(--color-border-hairline, #c8c8c5)',
    };
  }

  return (
    <DashboardShell activeHref="/projects" user={user}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Page header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: '-0.025em',
                color: 'var(--color-text-primary, #111)',
              }}
            >
              Projects
            </h1>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: 13,
                color: 'var(--color-text-secondary, #6b7280)',
              }}
            >
              All active and pipeline projects
            </p>
          </div>
          {isEditor && (
            <Button variant="primary" onClick={() => router.push('/projects/new')}>
              + New project
            </Button>
          )}
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" style={viewBtnStyle('table')} onClick={() => switchView('table')}>
            Table
          </button>
          <button type="button" style={viewBtnStyle('map')} onClick={() => switchView('map')}>
            Map
          </button>
          <button
            type="button"
            style={viewBtnStyle('timeline')}
            onClick={() => switchView('timeline')}
          >
            Timeline
          </button>
        </div>

        {/* Filter row */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {STAGE_FILTERS.map((f) => (
              <FilterChip
                key={f.id}
                label={f.label}
                active={stageFilter === f.id}
                onClick={() => setStageFilter(f.id)}
              />
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <input
              type="text"
              placeholder="Search projects…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                fontSize: 13,
                padding: '8px 12px',
                width: 240,
                borderRadius: 8,
                border: '1px solid var(--color-border-hairline, #c8c8c5)',
                background: 'var(--color-surface-base, #fff)',
                color: 'var(--color-text-primary, #111)',
                outline: 'none',
              }}
            />
            <span
              style={{
                fontSize: 12,
                color: 'var(--color-text-tertiary, #767b84)',
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {rows.length} {rows.length === 1 ? 'result' : 'results'}
            </span>
          </div>
        </div>

        {/* Content */}
        {rows.length === 0 ? (
          <EmptyState hasFilters={stageFilter !== 'all' || query.trim().length > 0} />
        ) : view === 'table' ? (
          <ProjectsTable
            rows={rows}
            sortCol={sortCol}
            sortDir={sortDir}
            onSort={handleSortCol}
            onRowClick={(id) => router.push('/projects/' + id)}
          />
        ) : view === 'map' ? (
          <div
            style={{ ...card, padding: 48, textAlign: 'center', color: 'var(--color-text-tertiary, #767b84)', fontSize: 13 }}
          >
            <p style={{ margin: 0, fontWeight: 700 }}>Map view</p>
            <p style={{ margin: '8px 0 0' }}>
              MapLibre GL integration ships in V6.1 v2 once the dependency is confirmed. All{' '}
              {rows.length} projects have been geocoded.
            </p>
          </div>
        ) : (
          <TimelineView rows={rows} onRowClick={(id) => router.push('/projects/' + id)} />
        )}
      </div>
    </DashboardShell>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Table view
// ────────────────────────────────────────────────────────────────────────────

function ProjectsTable({
  rows,
  sortCol,
  sortDir,
  onSort,
  onRowClick,
}: {
  rows: ProjectRowVM[];
  sortCol: string;
  sortDir: 'asc' | 'desc';
  onSort: (col: string) => void;
  onRowClick: (id: string) => void;
}) {
  return (
    <div
      style={{
        ...card,
        overflow: 'hidden',
      }}
    >
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 13,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <thead>
            <tr>
              {TABLE_COLUMNS.map((col) => (
                <th
                  key={col.id}
                  onClick={() => onSort(col.id)}
                  style={{
                    position: 'sticky',
                    top: 0,
                    background: 'var(--color-surface-raised, #fff)',
                    borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)',
                    padding: '10px 14px',
                    textAlign: col.numeric ? 'right' : 'left',
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--color-text-tertiary, #767b84)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {col.label}
                  {sortCol === col.id && (
                    <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const tier = getCommitmentTier(p);
              const isProspect = tier === 'prospect';
              return (
                <tr
                  key={p.id}
                  onClick={() => onRowClick(p.id)}
                  style={{
                    cursor: 'pointer',
                    opacity: isProspect ? 0.8 : 1,
                    borderBottom: '1px solid var(--color-border-subtle, #e5e5e3)',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background =
                      'var(--color-surface-sunken, #fafaf8)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background = 'transparent';
                  }}
                >
                  {/* Project */}
                  <td style={{ padding: '10px 14px' }}>
                    <div
                      style={{
                        fontWeight: 700,
                        color: 'var(--color-text-primary, #111)',
                        whiteSpace: 'nowrap',
                        maxWidth: 220,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {p.name}
                    </div>
                    {p.address && (
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--color-text-tertiary, #767b84)',
                          marginTop: 1,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: 220,
                        }}
                      >
                        {p.address}
                      </div>
                    )}
                  </td>

                  {/* Stage */}
                  <td
                    style={{
                      padding: '10px 14px',
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--color-text-tertiary, #767b84)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {prettyStage(p.stage)}
                  </td>

                  {/* $/sqft target */}
                  <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {p.sale_price_per_sqft_override != null
                      ? '$' + Math.round(p.sale_price_per_sqft_override).toLocaleString()
                      : '—'}
                  </td>

                  {/* Total revenue */}
                  <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {p.total_sales > 0 ? compact(p.total_sales) : '—'}
                  </td>

                  {/* Margin */}
                  <td
                    style={{
                      padding: '10px 14px',
                      textAlign: 'right',
                      fontWeight: 600,
                      color: marginColor(p.margin_pct),
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {(p.margin_pct * 100).toFixed(1)}%
                  </td>

                  {/* Sale month */}
                  <td
                    style={{
                      padding: '10px 14px',
                      textAlign: 'left',
                      color: 'var(--color-text-secondary, #6b7280)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    —
                  </td>

                  {/* Owner */}
                  <td
                    style={{
                      padding: '10px 14px',
                      textAlign: 'left',
                      color: 'var(--color-text-secondary, #6b7280)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    —
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Timeline view
// ────────────────────────────────────────────────────────────────────────────

function TimelineView({
  rows,
  onRowClick,
}: {
  rows: ProjectRowVM[];
  onRowClick: (id: string) => void;
}) {
  // Determine portfolio date window
  const dates = rows.flatMap((p) => {
    const out: Date[] = [];
    if (p.start_date) out.push(new Date(p.start_date));
    if (p.sale_date) out.push(new Date(p.sale_date));
    return out;
  });

  const now = new Date();

  const minDate =
    dates.length > 0
      ? new Date(Math.min(...dates.map((d) => d.getTime())))
      : new Date(now.getFullYear(), now.getMonth(), 1);

  const maxDate =
    dates.length > 0
      ? new Date(Math.max(...dates.map((d) => d.getTime())))
      : new Date(now.getFullYear() + 2, now.getMonth(), 1);

  // Snap to month boundaries
  const startMonth = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const endMonth = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 1);

  const totalMs = endMonth.getTime() - startMonth.getTime();
  const MONTH_PX = 60;

  // Build month labels
  const monthLabels: { label: string; left: number }[] = [];
  let cursor = new Date(startMonth);
  while (cursor < endMonth) {
    const left =
      ((cursor.getTime() - startMonth.getTime()) / totalMs) *
      (MONTH_PX * monthCount(startMonth, endMonth));
    monthLabels.push({
      label: cursor.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      left,
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  const totalWidth = MONTH_PX * monthCount(startMonth, endMonth);
  const NAME_COL = 180;

  // Today marker position
  const todayLeft =
    now >= startMonth && now < endMonth
      ? ((now.getTime() - startMonth.getTime()) / totalMs) * totalWidth
      : null;

  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)',
          background: 'var(--color-surface-raised, #fff)',
          position: 'sticky',
          top: 0,
          zIndex: 2,
        }}
      >
        <div
          style={{
            width: NAME_COL,
            minWidth: NAME_COL,
            padding: '8px 14px',
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-text-tertiary, #767b84)',
            borderRight: '1px solid var(--color-border-hairline, #c8c8c5)',
          }}
        >
          Project
        </div>
        <div style={{ overflowX: 'auto', flex: 1, position: 'relative' }}>
          <div style={{ width: totalWidth, height: 32, position: 'relative' }}>
            {monthLabels.map((m) => (
              <span
                key={m.label}
                style={{
                  position: 'absolute',
                  left: m.left + 4,
                  top: 8,
                  fontSize: 10,
                  color: 'var(--color-text-tertiary, #767b84)',
                  whiteSpace: 'nowrap',
                }}
              >
                {m.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Rows */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: NAME_COL + totalWidth }}>
          {rows.map((p) => {
            const tier = getCommitmentTier(p);
            const isProspect = tier === 'prospect';
            const barColor = STAGE_COLORS[p.stage] ?? 'var(--color-border-hairline, #c8c8c5)';

            let barLeft = 0;
            let barWidth = MONTH_PX * 2; // fallback 2-month placeholder

            if (p.start_date && p.sale_date) {
              const sd = new Date(p.start_date);
              const ed = new Date(p.sale_date);
              barLeft = Math.max(
                0,
                ((sd.getTime() - startMonth.getTime()) / totalMs) * totalWidth
              );
              const rawRight = ((ed.getTime() - startMonth.getTime()) / totalMs) * totalWidth;
              barWidth = Math.max(4, rawRight - barLeft);
            } else if (p.start_date) {
              const sd = new Date(p.start_date);
              barLeft = Math.max(
                0,
                ((sd.getTime() - startMonth.getTime()) / totalMs) * totalWidth
              );
            }

            return (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  borderBottom: '1px solid var(--color-border-subtle, #e5e5e3)',
                  alignItems: 'center',
                  opacity: isProspect ? 0.8 : 1,
                }}
              >
                {/* Name column */}
                <div
                  style={{
                    width: NAME_COL,
                    minWidth: NAME_COL,
                    padding: '8px 14px',
                    borderRight: '1px solid var(--color-border-hairline, #c8c8c5)',
                    cursor: 'pointer',
                  }}
                  onClick={() => onRowClick(p.id)}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--color-text-primary, #111)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {p.name}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--color-text-tertiary, #767b84)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      marginTop: 1,
                    }}
                  >
                    {prettyStage(p.stage)}
                  </div>
                </div>

                {/* Bar lane */}
                <div
                  style={{
                    position: 'relative',
                    height: 48,
                    width: totalWidth,
                    minWidth: totalWidth,
                  }}
                >
                  {/* Today line */}
                  {todayLeft !== null && (
                    <div
                      style={{
                        position: 'absolute',
                        left: todayLeft,
                        top: 0,
                        bottom: 0,
                        width: 1,
                        background: 'var(--color-accent-lime, #ddec65)',
                        zIndex: 1,
                      }}
                    />
                  )}
                  {/* Project bar */}
                  <div
                    onClick={() => onRowClick(p.id)}
                    style={{
                      position: 'absolute',
                      left: barLeft,
                      width: barWidth,
                      top: 10,
                      height: 28,
                      borderRadius: 4,
                      background: barColor,
                      border: '1px solid rgba(0,0,0,0.08)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      paddingLeft: 8,
                      overflow: 'hidden',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--color-text-primary, #111)',
                      whiteSpace: 'nowrap',
                      zIndex: 2,
                    }}
                    title={p.name}
                  >
                    {barWidth > 40 ? p.name : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function monthCount(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

// ────────────────────────────────────────────────────────────────────────────
// Empty state
// ────────────────────────────────────────────────────────────────────────────

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div
      style={{
        ...card,
        padding: 32,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: 'var(--color-text-primary, #111)',
        }}
      >
        No projects match
      </div>
      <p
        style={{
          margin: '6px 0 0',
          fontSize: 13,
          color: 'var(--color-text-secondary, #6b7280)',
        }}
      >
        {hasFilters
          ? 'Try clearing the filters or search query.'
          : 'No projects in the pipeline yet.'}
      </p>
    </div>
  );
}
