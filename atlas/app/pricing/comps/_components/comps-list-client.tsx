'use client';

/**
 * Comp library list + filter chips + search.
 *
 * Filtering is client-side (P0 expects <1k rows). Server side handles the
 * archive/visibility cut; everything else stays here.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FilterChip } from '@/components/ui/FilterChip';
import type { CompView } from '@/lib/repos/comps';

interface SubCutOpt {
  key: string;
  label: string;
}

const STATUS_FILTERS = [
  { id: 'any', label: 'All status' },
  { id: 'closed', label: 'Closed' },
  { id: 'active', label: 'Active' },
  { id: 'pending', label: 'Pending' },
  { id: 'withdrawn', label: 'Withdrawn' },
] as const;

function fmtMoney(cents: number | null): string {
  if (cents == null) return '—';
  const usd = cents / 100;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(usd >= 10_000_000 ? 0 : 2)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}k`;
  return `$${usd.toFixed(0)}`;
}

function fmtPsf(v: number | null): string {
  if (v == null) return '—';
  return `$${Math.round(v).toLocaleString()}/sf`;
}

export function CompsListClient({
  initialComps,
  subCuts,
  canEdit,
}: {
  initialComps: CompView[];
  subCuts: SubCutOpt[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [subCutFilter, setSubCutFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('any');
  const [query, setQuery] = useState<string>('');

  const rows = useMemo(() => {
    let r = initialComps;
    if (subCutFilter !== 'all') {
      r = r.filter((c) => c.subCutKey === subCutFilter);
    }
    if (statusFilter !== 'any') {
      r = r.filter((c) => c.status === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      r = r.filter(
        (c) =>
          c.address.toLowerCase().includes(q) ||
          (c.broker ?? '').toLowerCase().includes(q) ||
          (c.notes ?? '').toLowerCase().includes(q)
      );
    }
    return r;
  }, [initialComps, subCutFilter, statusFilter, query]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              margin: 0,
              color: 'var(--color-text-primary)',
            }}
          >
            Comp library
          </h1>
          <p
            style={{
              margin: '4px 0 0 0',
              fontSize: 13,
              color: 'var(--color-text-secondary)',
            }}
          >
            {initialComps.length.toLocaleString()} comps · {rows.length.toLocaleString()} shown
          </p>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Link
              href="/pricing/comps/import"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--color-text-primary)',
                background: 'var(--color-surface-base)',
                border: '1px solid var(--color-border-hairline)',
                borderRadius: 8,
                textDecoration: 'none',
              }}
            >
              Bulk import
            </Link>
            <Link
              href="/pricing/comps/new"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 500,
                color: '#fff',
                background: 'var(--color-accent-base, #131313)',
                borderRadius: 8,
                textDecoration: 'none',
              }}
            >
              Add comp
            </Link>
          </div>
        )}
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search address, broker, notes…"
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
          <FilterChip
            label="All sub-cuts"
            active={subCutFilter === 'all'}
            onClick={() => setSubCutFilter('all')}
          />
          {subCuts.map((sc) => (
            <FilterChip
              key={sc.key}
              label={sc.label}
              active={subCutFilter === sc.key}
              onClick={() => setSubCutFilter(sc.key)}
            />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map((f) => (
            <FilterChip
              key={f.id}
              label={f.label}
              active={statusFilter === f.id}
              onClick={() => setStatusFilter(f.id)}
            />
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState canEdit={canEdit} />
      ) : (
        <div
          style={{
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border-hairline)',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
            }}
          >
            <thead>
              <tr style={{ background: 'var(--color-surface-base)' }}>
                <Th>Address</Th>
                <Th>Sub-cut</Th>
                <Th>Status</Th>
                <Th align="right">Price</Th>
                <Th align="right">Sqft</Th>
                <Th align="right">$/sf</Th>
                <Th>Closed</Th>
                {canEdit && <Th align="right">Edit</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  style={{
                    borderTop: '1px solid var(--color-border-hairline)',
                    cursor: canEdit ? 'pointer' : 'default',
                  }}
                  onClick={() => {
                    if (canEdit) router.push(`/pricing/comps/${c.id}/edit`);
                  }}
                >
                  <Td>
                    <div style={{ fontWeight: 500 }}>{c.address}</div>
                    {c.isNc && (
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>NC</div>
                    )}
                  </Td>
                  <Td>
                    {subCuts.find((s) => s.key === c.subCutKey)?.label ?? c.subCutKey}
                  </Td>
                  <Td>{c.status}</Td>
                  <Td align="right">{fmtMoney(c.salePriceCents)}</Td>
                  <Td align="right">{c.agSqft.toLocaleString()}</Td>
                  <Td align="right">{fmtPsf(c.psf)}</Td>
                  <Td>{c.closingDate ?? '—'}</Td>
                  {canEdit && (
                    <Td align="right">
                      <Link
                        href={`/pricing/comps/${c.id}/edit`}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          fontSize: 12,
                          color: 'var(--color-text-secondary)',
                          textDecoration: 'underline',
                        }}
                      >
                        Edit
                      </Link>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' | 'left' }) {
  return (
    <th
      style={{
        textAlign: align ?? 'left',
        padding: '10px 14px',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--color-text-tertiary)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, align }: { children: React.ReactNode; align?: 'right' | 'left' }) {
  return (
    <td
      style={{
        textAlign: align ?? 'left',
        padding: '10px 14px',
        color: 'var(--color-text-primary)',
        verticalAlign: 'top',
        fontVariantNumeric: align === 'right' ? 'tabular-nums' : 'normal',
      }}
    >
      {children}
    </td>
  );
}

function EmptyState({ canEdit }: { canEdit: boolean }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '40px 20px',
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 12,
        color: 'var(--color-text-secondary)',
      }}
    >
      <p style={{ margin: 0, fontSize: 14 }}>No comps match the current filters.</p>
      {canEdit && (
        <p style={{ margin: '8px 0 0 0', fontSize: 12 }}>
          Add comps via the buttons above to start building the library.
        </p>
      )}
    </div>
  );
}
