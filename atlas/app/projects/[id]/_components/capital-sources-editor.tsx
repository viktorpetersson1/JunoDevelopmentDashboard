'use client';

/**
 * Project Inputs — Capital sources funding stack editor (V6.2 T119).
 *
 * Standalone client island rendered inside the Inputs tab below the
 * InputsEditor button. Owns its own state, fetches lazily on first
 * "Edit" click, and persists via PUT /api/projects/[id]/capital-sources
 * (E1-gated, audit `source='ui'`, set up in T118).
 *
 * Native HTML5 drag-and-drop — same pattern as T112 pipeline-board.
 * Sources at index 0 are drawn FIRST (priority 0).
 *
 * Empty assignment list = back-compat. T120's aggregator treats projects
 * with no explicit assignments as funded entirely by the kpc_loc source.
 */

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { formatMoney } from '@/lib/utils/money';
import type { CapitalSourceView, SourceKind } from '@/lib/repos/capital-sources';

const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  kpc_loc: 'KPC LOC',
  project_finance: 'Project finance',
  recycled_equity: 'Recycled equity',
};

interface AssignmentRow {
  id?: string;            // server-issued — present on rows that already exist
  capitalSourceId: string;
  source: CapitalSourceView | null; // resolved from the active-sources fetch
}

export function CapitalSourcesEditor({
  projectKey,
  isEditor,
}: {
  projectKey: string;
  isEditor: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<CapitalSourceView[]>([]);
  const [assigned, setAssigned] = useState<AssignmentRow[]>([]);
  const [initialOrder, setInitialOrder] = useState<string[]>([]); // for dirty check
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const dirty = JSON.stringify(assigned.map((a) => a.capitalSourceId)) !== JSON.stringify(initialOrder);

  // Lazy fetch when the user opens the editor.
  useEffect(() => {
    if (!open || loading || sources.length > 0) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [sRes, aRes] = await Promise.all([
          fetch('/api/capital-sources'),
          fetch(`/api/projects/${projectKey}/capital-sources`),
        ]);
        if (!sRes.ok || !aRes.ok) {
          setError(`Failed to load capital sources (HTTP ${sRes.status}/${aRes.status})`);
          setLoading(false);
          return;
        }
        const sJson = (await sRes.json()) as { data?: { sources?: CapitalSourceView[] } };
        const aJson = (await aRes.json()) as {
          data?: { assignments?: Array<{ id: string; capitalSourceId: string; priority: number }> };
        };
        if (cancelled) return;
        const activeSources = sJson.data?.sources ?? [];
        const assignments = (aJson.data?.assignments ?? []).sort((a, b) => a.priority - b.priority);
        const rows: AssignmentRow[] = assignments.map((a) => ({
          id: a.id,
          capitalSourceId: a.capitalSourceId,
          source: activeSources.find((s) => s.id === a.capitalSourceId) ?? null,
        }));
        setSources(activeSources);
        setAssigned(rows);
        setInitialOrder(rows.map((r) => r.capitalSourceId));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Network error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, projectKey, loading, sources.length]);

  const unassigned = sources.filter((s) => !assigned.some((a) => a.capitalSourceId === s.id));

  function addSource(sourceId: string) {
    const src = sources.find((s) => s.id === sourceId);
    if (!src) return;
    setAssigned((curr) => [...curr, { capitalSourceId: sourceId, source: src }]);
  }

  function removeAt(idx: number) {
    setAssigned((curr) => curr.filter((_, i) => i !== idx));
  }

  function onDragStart(e: React.DragEvent, idx: number) {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIdx !== idx) setDragOverIdx(idx);
  }

  function onDrop(e: React.DragEvent, targetIdx: number) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    setAssigned((curr) => {
      const next = [...curr];
      const [moved] = next.splice(dragIdx, 1);
      if (moved) next.splice(targetIdx, 0, moved);
      return next;
    });
    setDragIdx(null);
    setDragOverIdx(null);
  }

  function onDragEnd() {
    setDragIdx(null);
    setDragOverIdx(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectKey}/capital-sources`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceIds: assigned.map((a) => a.capitalSourceId) }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(json?.error?.message ?? `Save failed (HTTP ${res.status})`);
        setSaving(false);
        return;
      }
      setInitialOrder(assigned.map((a) => a.capitalSourceId));
      setSaving(false);
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      setSaving(false);
    }
  }

  if (!isEditor) return null;

  // Collapsed state: just a thin pill that opens the editor.
  if (!open) {
    return (
      <section style={card}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <h3 style={sectionLabel}>Capital sources</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              Per-project funding stack. Configure the lender priority order. If empty,
              defaults to KPC LOC only (T120 aggregator).
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            Edit funding stack
          </Button>
        </header>
      </section>
    );
  }

  // Expanded state: full editor.
  return (
    <section style={card}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div>
          <h3 style={sectionLabel}>Capital sources funding stack</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Drag to reorder. Position 1 is drawn first. Empty stack = KPC LOC only (back-compat).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setError(null); }} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={save} loading={saving} disabled={!dirty || loading}>
            Save funding stack
          </Button>
        </div>
      </header>

      {error && (
        <div role="alert" style={errorBanner}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>Loading capital sources…</p>
      ) : (
        <>
          {/* Stack */}
          <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {assigned.length === 0 ? (
              <li style={{ fontSize: 13, color: 'var(--color-text-tertiary)', padding: '8px 0' }}>
                No sources assigned yet. Default fallback: KPC LOC. Add a source below to make it explicit.
              </li>
            ) : (
              assigned.map((row, idx) => (
                <li
                  key={row.capitalSourceId}
                  draggable
                  onDragStart={(e) => onDragStart(e, idx)}
                  onDragOver={(e) => onDragOver(e, idx)}
                  onDrop={(e) => onDrop(e, idx)}
                  onDragEnd={onDragEnd}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    border: `1px solid ${dragOverIdx === idx && dragIdx !== idx ? 'var(--color-accent-lime, #ddec65)' : 'var(--color-border-hairline)'}`,
                    borderRadius: 8,
                    marginBottom: 6,
                    background: dragIdx === idx ? 'var(--color-surface-muted)' : 'var(--color-surface-base)',
                    cursor: 'grab',
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11, minWidth: 18 }}>{idx + 1}.</span>
                  <span aria-hidden="true" style={{ color: 'var(--color-text-tertiary)', cursor: 'grab', fontSize: 14 }}>⋮⋮</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {row.source?.sourceName ?? '(unknown source)'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                      {row.source ? SOURCE_KIND_LABELS[row.source.sourceKind] : ''}
                      {row.source && ` · headroom ${formatMoney(row.source.headroomUsd * 100, { compact: true, precision: 1 })}`}
                      {row.source?.covenantMaxLtcPct != null && ` · max LTC ${(row.source.covenantMaxLtcPct * 100).toFixed(1)}%`}
                      {row.source?.covenantMaxConcurrentProjects != null && ` · max ${row.source.covenantMaxConcurrentProjects} concurrent`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAt(idx)}
                    title="Remove from stack"
                    style={{
                      fontSize: 16, padding: '0 6px', border: 'none', cursor: 'pointer',
                      background: 'none', color: 'var(--color-negative, #b91c1c)', lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </li>
              ))
            )}
          </ol>

          {/* Add row */}
          {unassigned.length > 0 ? (
            <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Add source
              </label>
              <select
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) addSource(v);
                  e.target.value = '';
                }}
                defaultValue=""
                style={{
                  flex: 1, fontSize: 13, padding: '6px 10px', borderRadius: 6,
                  border: '1px solid var(--color-border-hairline)', background: 'var(--color-surface-base)',
                }}
              >
                <option value="" disabled>Choose a source…</option>
                {unassigned.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.sourceName} ({SOURCE_KIND_LABELS[s.sourceKind]}) · headroom {formatMoney(s.headroomUsd * 100, { compact: true, precision: 1 })}
                  </option>
                ))}
              </select>
            </div>
          ) : sources.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 12 }}>
              No capital sources configured yet. Super-admins can add them in{' '}
              <a href="/settings?tab=capital-sources" style={{ color: 'var(--color-text-secondary)' }}>
                Settings → Capital Sources
              </a>
              .
            </p>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 12 }}>
              All active capital sources are already in the stack.
            </p>
          )}
        </>
      )}
    </section>
  );
}

// ── Styles (consistent with InputsTab Cards) ─────────────────────────────────

const card: React.CSSProperties = {
  background: 'var(--ja-card-bg)',
  border: 'var(--ja-card-border)',
  borderRadius: 'var(--ja-card-radius)',
  padding: 'var(--ja-card-padding)',
  marginTop: 16,
};

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--color-text-tertiary)',
  margin: 0,
  fontWeight: 700,
};

const errorBanner: React.CSSProperties = {
  marginBottom: 12,
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--color-negative, #b91c1c)',
  background: 'var(--color-negative-soft, #fef2f2)',
  color: 'var(--color-negative, #b91c1c)',
  fontSize: 13,
};
