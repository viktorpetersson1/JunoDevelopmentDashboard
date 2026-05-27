'use client';

/**
 * V4.8 — Suggestions queue client component.
 *
 * - Status filter chips (All / Pending / Approved / Rejected / Applied)
 * - Approve / Reject / Mark applied buttons per row
 * - Inline expand for the assistant summary + proposed patch
 * - Refresh button to re-fetch
 *
 * State lives in React (no URL params) so the user can flip filters
 * without server round-trips. The list itself is server-hydrated;
 * after a mutation we patch the local copy + the underlying row
 * optimistically, then refresh from server on next mount to converge.
 */

import { useMemo, useState, useTransition } from 'react';
import type { SuggestionStatus, SuggestionView } from '@/lib/repos/suggestions';

type FilterValue = SuggestionStatus | 'all';
const FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'applied', label: 'Applied' },
  { value: 'rejected', label: 'Rejected' },
];

interface Props {
  initial: SuggestionView[];
}

export function SuggestionsClient({ initial }: Props) {
  const [rows, setRows] = useState<SuggestionView[]>(initial);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter]
  );

  const counts = useMemo(() => {
    const c = { all: rows.length, pending: 0, approved: 0, rejected: 0, applied: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  async function transition(id: string, next: SuggestionStatus) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/suggestions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(body?.error?.message ?? `${res.status} ${res.statusText}`);
      }
      const body = (await res.json()) as { suggestion: SuggestionView };
      setRows((cur) => cur.map((r) => (r.id === id ? body.suggestion : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function refresh() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/suggestions?status=all&limit=200', {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const body = (await res.json()) as { suggestions: SuggestionView[] };
        setRows(body.suggestions);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function toggleExpand(id: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filter chips + refresh */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => {
            const active = filter === f.value;
            const count = counts[f.value];
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 999,
                  border: '1px solid var(--color-border-hairline)',
                  background: active ? 'var(--color-accent-base, #131313)' : 'var(--color-surface-base)',
                  color: active ? '#fff' : 'var(--color-text-primary)',
                  cursor: 'pointer',
                }}
              >
                {f.label}
                <span style={{ marginLeft: 6, opacity: 0.75 }}>{count}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={refresh}
          style={{
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 500,
            borderRadius: 8,
            border: '1px solid var(--color-border-hairline)',
            background: 'var(--color-surface-base)',
            color: 'var(--color-text-primary)',
            cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            background: 'var(--color-negative-soft, #fef2f2)',
            border: '1px solid var(--color-border-hairline)',
            borderLeft: '3px solid var(--color-negative, #b91c1c)',
            borderRadius: 8,
            fontSize: 13,
            color: 'var(--color-negative, #b91c1c)',
          }}
        >
          {error}
        </div>
      )}

      {/* Table */}
      <div
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border-hairline)',
          borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            {filter === 'all'
              ? 'No suggestions yet. Hit the Ask Juno launcher → "Suggest a change" to drop one.'
              : `No suggestions with status "${filter}".`}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
                  <th style={th()}>When</th>
                  <th style={th()}>From</th>
                  <th style={th()}>Request</th>
                  <th style={th()}>Status</th>
                  <th style={th('right')}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <SuggestionRow
                    key={r.id}
                    row={r}
                    expanded={expanded.has(r.id)}
                    onToggle={() => toggleExpand(r.id)}
                    onTransition={(next) => transition(r.id, next)}
                    busy={busyId === r.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SuggestionRow({
  row,
  expanded,
  onToggle,
  onTransition,
  busy,
}: {
  row: SuggestionView;
  expanded: boolean;
  onToggle: () => void;
  onTransition: (next: SuggestionStatus) => void;
  busy: boolean;
}) {
  const submitter = row.submittedByDisplayName ?? row.submittedByEmail ?? row.submittedBy.slice(0, 8);
  const when = formatDate(row.submittedAt);
  const hasDetails = !!row.assistantSummary || !!row.proposedPatch || !!row.pathname;

  return (
    <>
      <tr style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
        <td style={td()}>
          <span style={{ color: 'var(--color-text-secondary)' }}>{when}</span>
        </td>
        <td style={td()}>
          <span style={{ color: 'var(--color-text-primary)' }}>{submitter}</span>
          {row.submittedByEmail && row.submittedByDisplayName && (
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {row.submittedByEmail}
            </div>
          )}
        </td>
        <td style={{ ...td(), maxWidth: 480 }}>
          <button
            type="button"
            onClick={onToggle}
            disabled={!hasDetails}
            title={hasDetails ? (expanded ? 'Hide details' : 'Show details') : undefined}
            style={{
              all: 'unset',
              cursor: hasDetails ? 'pointer' : 'default',
              color: 'var(--color-text-primary)',
              display: 'block',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {row.prompt}
            {hasDetails && (
              <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                {expanded ? '▾' : '▸'}
              </span>
            )}
          </button>
        </td>
        <td style={td()}>
          <StatusPill status={row.status} />
        </td>
        <td style={{ ...td('right') }}>
          <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {row.status === 'pending' && (
              <>
                <ActionButton tone="positive" disabled={busy} onClick={() => onTransition('approved')}>
                  Approve
                </ActionButton>
                <ActionButton tone="negative" disabled={busy} onClick={() => onTransition('rejected')}>
                  Reject
                </ActionButton>
              </>
            )}
            {row.status === 'approved' && (
              <ActionButton tone="primary" disabled={busy} onClick={() => onTransition('applied')}>
                Mark applied
              </ActionButton>
            )}
            {(row.status === 'rejected' || row.status === 'applied') && (
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>—</span>
            )}
          </div>
        </td>
      </tr>
      {expanded && hasDetails && (
        <tr style={{ background: 'var(--color-surface-sunken, #f7f7f7)' }}>
          <td colSpan={5} style={{ padding: '12px 16px' }}>
            <DetailsBlock row={row} />
          </td>
        </tr>
      )}
    </>
  );
}

function DetailsBlock({ row }: { row: SuggestionView }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
      {row.pathname && (
        <div>
          <strong style={{ color: 'var(--color-text-secondary)' }}>Path:</strong>{' '}
          <code
            style={{
              background: 'var(--color-surface-base)',
              padding: '2px 6px',
              borderRadius: 4,
              fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            }}
          >
            {row.pathname}
          </code>
        </div>
      )}
      {row.assistantSummary && (
        <div>
          <strong style={{ color: 'var(--color-text-secondary)' }}>Assistant summary:</strong>
          <p style={{ margin: '4px 0 0 0', color: 'var(--color-text-primary)' }}>{row.assistantSummary}</p>
        </div>
      )}
      {row.proposedPatch != null && (
        <div>
          <strong style={{ color: 'var(--color-text-secondary)' }}>Proposed patch:</strong>
          <pre
            style={{
              margin: '4px 0 0 0',
              padding: 10,
              background: 'var(--color-surface-base)',
              border: '1px solid var(--color-border-hairline)',
              borderRadius: 6,
              fontSize: 11,
              fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
              overflowX: 'auto',
              maxHeight: 240,
            }}
          >
            {JSON.stringify(row.proposedPatch, null, 2)}
          </pre>
        </div>
      )}
      {row.reviewedAt && (
        <div style={{ color: 'var(--color-text-tertiary)' }}>
          Reviewed {formatDate(row.reviewedAt)}
          {row.reviewNote && ` — "${row.reviewNote}"`}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: SuggestionStatus }) {
  const cfg: Record<SuggestionStatus, { bg: string; fg: string; label: string }> = {
    pending: { bg: 'rgba(234, 179, 8, 0.12)', fg: '#a16207', label: 'Pending' },
    approved: { bg: 'rgba(34, 197, 94, 0.12)', fg: '#15803d', label: 'Approved' },
    applied: { bg: 'rgba(15, 23, 42, 0.08)', fg: '#0f172a', label: 'Applied' },
    rejected: { bg: 'rgba(220, 38, 38, 0.10)', fg: '#b91c1c', label: 'Rejected' },
  };
  const c = cfg[status];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: c.bg,
        color: c.fg,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {c.label}
    </span>
  );
}

function ActionButton({
  children,
  tone,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  tone: 'positive' | 'negative' | 'primary';
  disabled?: boolean;
  onClick: () => void;
}) {
  const styles: Record<typeof tone, { bg: string; fg: string; border: string }> = {
    positive: { bg: 'transparent', fg: '#15803d', border: '1px solid #15803d' },
    negative: { bg: 'transparent', fg: '#b91c1c', border: '1px solid #b91c1c' },
    primary: { bg: 'var(--color-accent-base, #131313)', fg: '#fff', border: '1px solid transparent' },
  };
  const s = styles[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '4px 12px',
        fontSize: 12,
        fontWeight: 500,
        borderRadius: 6,
        background: s.bg,
        color: s.fg,
        border: s.border,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function th(align: 'left' | 'right' = 'left'): React.CSSProperties {
  return {
    textAlign: align,
    padding: '10px 14px',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)',
    background: 'var(--color-surface-sunken, #f7f7f7)',
  };
}

function td(align: 'left' | 'right' = 'left'): React.CSSProperties {
  return {
    textAlign: align,
    padding: '12px 14px',
    color: 'var(--color-text-primary)',
    verticalAlign: 'top',
  };
}
