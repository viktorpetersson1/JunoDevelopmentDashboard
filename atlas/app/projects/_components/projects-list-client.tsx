'use client';

/**
 * Client side of the Projects list surface. Receives pre-fetched
 * projects + their KPIs from the Server Component above; owns filter
 * + search state + row navigation.
 *
 * Filtering is client-side for P0 (~10 projects). At >100 projects the
 * filter chips + search box should re-fetch via URL params instead.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ListPage } from '@/patterns/ListPage';
import { FilterChip } from '@/components/ui/FilterChip';
import { Status } from '@/components/data/Status';
import type { TableColumn } from '@/components/data/Table';
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

function statusToState(status: string): 'positive' | 'warning' | 'negative' | 'neutral' | 'info' {
  switch (status) {
    case 'committed':
      return 'positive';
    case 'pipeline':
      return 'info';
    default:
      return 'neutral';
  }
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
    return r;
  }, [initialRows, stageFilter, query]);

  const columns: TableColumn<ProjectRowVM>[] = [
    {
      key: 'name',
      header: 'Project',
      render: (r) => (
        <span>
          <div style={{ fontWeight: 500 }}>{r.name}</div>
          {r.address && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--color-text-tertiary)',
                marginTop: 2,
              }}
            >
              {r.address}
            </div>
          )}
        </span>
      ),
    },
    {
      key: 'stage',
      header: 'Stage',
      render: (r) => <span style={{ fontSize: 13 }}>{r.stage.replaceAll('_', ' ')}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Status state={statusToState(r.status)} label={r.status[0]!.toUpperCase() + r.status.slice(1)} />
      ),
    },
    {
      key: 'market',
      header: 'Market',
      render: (r) => <span style={{ fontSize: 13 }}>{r.market.replaceAll('_', ' ')}</span>,
    },
    {
      key: 'total_sales',
      header: 'Revenue',
      align: 'right',
      render: (r) => formatMoney(r.total_sales * 100, { compact: true, precision: 2 }),
    },
    {
      key: 'gross_profit',
      header: 'Profit',
      align: 'right',
      render: (r) => formatMoney(r.gross_profit * 100, { compact: true, precision: 2 }),
    },
    {
      key: 'margin_pct',
      header: 'Margin',
      align: 'right',
      render: (r) => `${(r.margin_pct * 100).toFixed(1)}%`,
    },
  ];

  return (
    <DashboardShell activeHref="/projects" user={user}>
      <ListPage<ProjectRowVM>
        title="Projects"
        subtitle="All active and pipeline projects"
        primaryAction={{
          label: 'New project',
          onClick: () => router.push('/projects/new'),
        }}
        filters={
          <>
            {STAGE_FILTERS.map((f) => (
              <FilterChip
                key={f.id}
                label={f.label}
                active={stageFilter === f.id}
                onClick={() => setStageFilter(f.id)}
              />
            ))}
          </>
        }
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search projects…"
        resultCount={rows.length}
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/projects/${r.id}`)}
        empty={{
          title: 'No projects match',
          description:
            stageFilter !== 'all' || query
              ? 'Try clearing the filters or search query.'
              : 'No projects in the pipeline yet.',
        }}
      />
    </DashboardShell>
  );
}
