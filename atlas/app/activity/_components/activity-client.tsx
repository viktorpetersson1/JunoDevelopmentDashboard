'use client';

/**
 * V4.9 — Global activity feed client.
 *
 * Renders the audit timeline grouped by day (Today / Yesterday / Date).
 * INVENTORY columns inline per entry: timestamp + category badge + action
 * + scope/resource + user. CSV export hashes nothing — emits the raw
 * audit row as a flat CSV.
 *
 * Filter pills: category-level (all / project / capital_call / snapshot /
 * pricing_run / api). Client-side only, no re-fetch.
 */

import { useMemo, useState } from 'react';
import type { AuditEntryView } from '@/lib/repos/audit-log';

const CATEGORY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'project', label: 'Project' },
  { id: 'capital_call', label: 'Capital call' },
  { id: 'snapshot', label: 'Snapshot' },
  { id: 'pricing_run', label: 'Pricing run' },
  { id: 'api', label: 'API' },
  { id: 'service', label: 'Service' },
] as const;

export function ActivityClient({
  entries,
  userDisplayNames,
}: {
  entries: AuditEntryView[];
  userDisplayNames: Record<string, string>;
}) {
  const [category, setCategory] = useState<string>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    let rows = entries;
    if (category !== 'all') rows = rows.filter((r) => r.category === category);
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.route.toLowerCase().includes(q) ||
          r.action.toLowerCase().includes(q) ||
          (r.resourceId ?? '').toLowerCase().includes(q) ||
          (r.userId && userDisplayNames[r.userId]?.toLowerCase().includes(q))
      );
    }
    return rows;
  }, [entries, category, query, userDisplayNames]);

  // Group by day label (Today / Yesterday / YYYY-MM-DD).
  const groups = useMemo(() => groupByDay(filtered), [filtered]);

  function exportCsv() {
    const header = ['timestamp', 'user', 'category', 'action', 'resource_id', 'method', 'status', 'route'];
    const rows = filtered.map((e) => [
      e.createdAt,
      e.userId ? userDisplayNames[e.userId] ?? e.userId : '(anonymous)',
      e.category,
      e.action,
      e.resourceId ?? '',
      e.method,
      String(e.statusCode),
      e.route,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map(csvCell).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atlas-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0, color: 'var(--color-text-primary)' }}>
            Activity
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Global audit log — every API mutation, every service emit. Newest 200 entries.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={exportCsv}
            style={{
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--color-text-primary)',
              background: 'var(--color-surface-base)',
              border: '1px solid var(--color-border-hairline)',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Export CSV
          </button>
        </div>
      </header>

      {/* Search + category chips */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search route, action, resource ID, user…"
          style={{
            padding: '8px 12px',
            fontSize: 13,
            border: '1px solid var(--color-border-hairline)',
            borderRadius: 8,
            background: 'var(--color-surface-base)',
            color: 'var(--color-text-primary)',
            maxWidth: 480,
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CATEGORY_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setCategory(f.id)}
              style={chip(category === f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Empty / grouped feed */}
      {filtered.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)', padding: 24, textAlign: 'center', background: 'var(--color-surface-raised)', borderRadius: 12, border: '1px solid var(--color-border-hairline)' }}>
          No audit entries match the current filters.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {groups.map((g) => (
            <section key={g.label}>
              <h2 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-tertiary)', margin: '0 0 8px 0' }}>
                {g.label}
              </h2>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, background: 'var(--color-surface-raised)', border: '1px solid var(--color-border-hairline)', borderRadius: 12, overflow: 'hidden' }}>
                {g.entries.map((e) => (
                  <li
                    key={e.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '90px 110px 1fr auto',
                      gap: 12,
                      padding: '10px 16px',
                      borderTop: '1px solid var(--color-border-hairline)',
                      alignItems: 'center',
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                      {e.createdAt.slice(11, 19)}
                    </span>
                    <CategoryBadge category={e.category} />
                    <span style={{ color: 'var(--color-text-primary)' }}>
                      <strong>{e.action}</strong>
                      {e.resourceId && (
                        <span style={{ color: 'var(--color-text-tertiary)' }}>
                          {' · '}
                          {e.resourceId.length > 12 ? e.resourceId.slice(0, 8) + '…' : e.resourceId}
                        </span>
                      )}
                      <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 8 }}>
                        ({e.method} {e.statusCode})
                      </span>
                    </span>
                    <span style={{ color: 'var(--color-text-tertiary)' }}>
                      {e.userId ? userDisplayNames[e.userId] ?? e.userId.slice(0, 8) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function groupByDay(rows: AuditEntryView[]): Array<{ label: string; entries: AuditEntryView[] }> {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const buckets = new Map<string, AuditEntryView[]>();
  for (const r of rows) {
    const day = r.createdAt.slice(0, 10);
    if (!buckets.has(day)) buckets.set(day, []);
    buckets.get(day)!.push(r);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, entries]) => ({
      label: day === today ? 'Today' : day === yesterday ? 'Yesterday' : day,
      entries,
    }));
}

function CategoryBadge({ category }: { category: string }) {
  const palette: Record<string, { bg: string; color: string }> = {
    project: { bg: 'rgba(59,130,246,0.12)', color: '#1d4ed8' },
    capital_call: { bg: 'rgba(22,163,74,0.12)', color: '#15803d' },
    snapshot: { bg: 'rgba(124,58,237,0.12)', color: '#6d28d9' },
    pricing_run: { bg: 'rgba(217,119,6,0.18)', color: '#854d0e' },
    api: { bg: 'var(--color-surface-base)', color: 'var(--color-text-tertiary)' },
    service: { bg: 'var(--color-surface-base)', color: 'var(--color-text-tertiary)' },
  };
  const c = palette[category] ?? palette.api!;
  return (
    <span
      style={{
        fontSize: 10,
        padding: '2px 8px',
        borderRadius: 4,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        background: c.bg,
        color: c.color,
        justifySelf: 'start',
      }}
    >
      {category.replace('_', ' ')}
    </span>
  );
}

function chip(active: boolean): React.CSSProperties {
  return {
    padding: '4px 10px',
    fontSize: 12,
    background: active ? 'var(--color-accent-base, #131313)' : 'var(--color-surface-base)',
    color: active ? '#fff' : 'var(--color-text-secondary)',
    border: '1px solid var(--color-border-hairline)',
    borderRadius: 999,
    cursor: 'pointer',
  };
}

function csvCell(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
