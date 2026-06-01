'use client';

/**
 * Client side of the Projects list surface — tile grid.
 *
 * Receives pre-fetched projects + their KPIs from the Server Component
 * above; owns filter + search state + tile-click navigation.
 *
 * Layout: responsive grid of project tiles. Active/committed projects
 * render with full prominence; pipeline-status placeholders render in
 * a quieter style so the eye lands on real deals first.
 *
 * Filtering is client-side for P0 (~10 projects). At >100 projects the
 * filter chips + search box should re-fetch via URL params instead.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FilterChip } from '@/components/ui/FilterChip';
import { Button } from '@/components/ui/Button';
import { DashboardShell } from '@/app/_components/dashboard-shell';
import { formatMoney } from '@/lib/utils/money';
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
}

const STAGE_FILTERS: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'sourcing', label: 'Sourcing' },
  { id: 'pre_construction', label: 'Pre-construction' },
  { id: 'construction', label: 'Construction' },
  { id: 'pre_sales', label: 'Pre-sales' },
  { id: 'under_contract', label: 'Under contract' },
];

function prettyStage(stage: string): string {
  return stage.replaceAll('_', ' ');
}

function statusTone(status: string): 'positive' | 'info' | 'neutral' | 'warning' {
  switch (status) {
    case 'committed':
      return 'positive';
    case 'pipeline':
      return 'info';
    case 'archived':
      return 'neutral';
    default:
      return 'warning';
  }
}

function marginTone(margin: number): string {
  if (margin >= 0.2) return 'var(--color-positive, #15803d)';
  if (margin >= 0.1) return 'var(--color-text-primary, #111)';
  if (margin >= 0) return 'var(--color-warning, #a16207)';
  return 'var(--color-negative, #b91c1c)';
}

export function ProjectsListClient({
  rows: initialRows,
  user,
}: {
  rows: ProjectRowVM[];
  user: SidebarUser;
}) {
  const router = useRouter();
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [query, setQuery] = useState<string>('');

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
    // Sort: committed projects first, then by total sales descending. Pipeline
    // placeholders sink to the bottom so the eye lands on real deals first.
    return [...r].sort((a, b) => {
      const aIsActive = a.status === 'committed' ? 1 : 0;
      const bIsActive = b.status === 'committed' ? 1 : 0;
      if (aIsActive !== bIsActive) return bIsActive - aIsActive;
      return b.total_sales - a.total_sales;
    });
  }, [initialRows, stageFilter, query]);

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
                fontWeight: 600,
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
          <Button variant="primary" onClick={() => router.push('/projects/new')}>
            + New project
          </Button>
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

        {/* Tile grid */}
        {rows.length === 0 ? (
          <EmptyTiles hasFilters={stageFilter !== 'all' || query.trim().length > 0} />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 12,
            }}
          >
            {rows.map((p) => (
              <ProjectTile
                key={p.id}
                project={p}
                onClick={() => router.push(`/projects/${p.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tile
// ────────────────────────────────────────────────────────────────────────────

function ProjectTile({ project, onClick }: { project: ProjectRowVM; onClick: () => void }) {
  const isPipeline = project.status === 'pipeline';
  const tone = statusTone(project.status);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        cursor: 'pointer',
        background: isPipeline
          ? 'var(--color-surface-sunken, #fafaf8)'
          : 'var(--color-surface-raised, #fff)',
        border: '1px solid var(--color-border-hairline, #c8c8c5)',
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        fontFamily: 'inherit',
        outline: 'none',
        transition: 'border-color 120ms ease, background 120ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-text-primary, #111)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-hairline, #c8c8c5)';
      }}
    >
      {/* Header: name + stage badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: isPipeline
                ? 'var(--color-text-secondary, #6b7280)'
                : 'var(--color-text-primary, #111)',
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {project.name}
          </div>
          {project.address && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--color-text-tertiary, #767b84)',
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {project.address}
            </div>
          )}
        </div>
        <StageBadge stage={project.stage} />
      </div>

      {/* Status + market row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          color: 'var(--color-text-tertiary, #767b84)',
        }}
      >
        <StatusDot tone={tone} />
        <span
          style={{
            textTransform: 'capitalize',
            color: 'var(--color-text-secondary, #6b7280)',
          }}
        >
          {project.status}
        </span>
        {project.market && project.market !== 'default' && (
          <>
            <span>·</span>
            <span style={{ textTransform: 'capitalize' }}>
              {project.market.replaceAll('_', ' ')}
            </span>
          </>
        )}
      </div>

      {/* Metrics row */}
      <div
        style={{
          marginTop: 4,
          paddingTop: 10,
          borderTop: '1px solid var(--color-border-hairline, #c8c8c5)',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 8,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <TileMetric
          label="Revenue"
          value={
            project.total_sales > 0
              ? formatMoney(project.total_sales * 100, {
                  compact: true,
                  precision: 2,
                })
              : '—'
          }
          muted={isPipeline}
        />
        <TileMetric
          label="Profit"
          value={
            project.gross_profit !== 0
              ? formatMoney(project.gross_profit * 100, {
                  compact: true,
                  precision: 2,
                })
              : '—'
          }
          muted={isPipeline}
        />
        <TileMetric
          label="Margin"
          value={`${(project.margin_pct * 100).toFixed(1)}%`}
          color={marginTone(project.margin_pct)}
          muted={isPipeline}
        />
      </div>
    </button>
  );
}

function StageBadge({ stage }: { stage: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: '2px 7px',
        borderRadius: 999,
        background: 'var(--color-surface-base, #fff)',
        border: '1px solid var(--color-border-hairline, #c8c8c5)',
        color: 'var(--color-text-tertiary, #767b84)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {prettyStage(stage)}
    </span>
  );
}

function StatusDot({ tone }: { tone: 'positive' | 'info' | 'neutral' | 'warning' }) {
  const color =
    tone === 'positive'
      ? 'var(--color-positive, #15803d)'
      : tone === 'info'
        ? 'var(--color-accent-blue, #4f6fff)'
        : tone === 'warning'
          ? 'var(--color-warning, #a16207)'
          : 'var(--color-text-quaternary, #b0b5bc)';
  return (
    <span
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: 999,
        background: color,
      }}
      aria-hidden
    />
  );
}

function TileMetric({
  label,
  value,
  color,
  muted,
}: {
  label: string;
  value: string;
  color?: string;
  muted?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--color-text-tertiary, #767b84)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          marginTop: 2,
          color: muted
            ? 'var(--color-text-tertiary, #767b84)'
            : (color ?? 'var(--color-text-primary, #111)'),
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Empty state
// ────────────────────────────────────────────────────────────────────────────

function EmptyTiles({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div
      style={{
        background: 'var(--color-surface-raised, #fff)',
        border: '1px solid var(--color-border-hairline, #c8c8c5)',
        borderRadius: 12,
        padding: 32,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
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
