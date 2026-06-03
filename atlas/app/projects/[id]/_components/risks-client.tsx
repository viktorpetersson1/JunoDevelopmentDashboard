'use client';

/**
 * Risks tab — CRUD client (V6.1 T109).
 *
 * Editor-gated: viewers see the table read-only; editors get + Add risk,
 * inline-edit cells, and a × delete button on each row.
 *
 * Pattern mirrors actuals-client.tsx: server renders the initial data;
 * this client island owns mutations + router.refresh() to re-render.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import type { ProjectRiskView } from '@/lib/repos/project-risks';

const SEVERITY_COLORS: Record<string, string> = {
  low:      'var(--color-text-tertiary)',
  medium:   'var(--color-warning, #a16207)',
  high:     'var(--color-negative, #b91c1c)',
  critical: 'var(--color-negative, #b91c1c)',
};

const STATUS_LABELS: Record<string, string> = {
  open:       'Open',
  mitigated:  'Mitigated',
  closed:     'Closed',
};

interface DraftRisk {
  risk: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  mitigation: string | null;
  status: 'open' | 'mitigated' | 'closed';
}

const EMPTY_DRAFT: DraftRisk = { risk: '', severity: 'medium', mitigation: null, status: 'open' };

export function RisksClient({
  projectKey,
  risks: initialRisks,
  isEditor,
}: {
  projectKey: string;
  risks: ProjectRiskView[];
  isEditor: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [risks, setRisks] = useState(initialRisks);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<DraftRisk>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<DraftRisk>>({});

  async function addRisk() {
    if (!draft.risk.trim()) { setError('Risk description is required'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectKey}/risks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const json = await res.json().catch(() => null) as { data?: { id: string }; error?: { message?: string } } | null;
      if (!res.ok) { setError(json?.error?.message ?? `Failed (HTTP ${res.status})`); setSaving(false); return; }
      setAddOpen(false);
      setDraft(EMPTY_DRAFT);
      startTransition(() => router.refresh());
    } catch (e) { setError(e instanceof Error ? e.message : 'Network error'); }
    setSaving(false);
  }

  async function saveEdit(id: string) {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/risks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editDraft),
      });
      if (!res.ok) { const j = await res.json().catch(() => null) as { error?: { message?: string } } | null; setError(j?.error?.message ?? 'Save failed'); setSaving(false); return; }
      setEditingId(null);
      startTransition(() => router.refresh());
    } catch (e) { setError(e instanceof Error ? e.message : 'Network error'); }
    setSaving(false);
  }

  async function deleteRisk(id: string) {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/risks/${id}`, { method: 'DELETE' });
      if (!res.ok) { const j = await res.json().catch(() => null) as { error?: { message?: string } } | null; setError(j?.error?.message ?? 'Delete failed'); setSaving(false); return; }
      setRisks((prev) => prev.filter((r) => r.id !== id));
      startTransition(() => router.refresh());
    } catch (e) { setError(e instanceof Error ? e.message : 'Network error'); }
    setSaving(false);
  }

  return (
    <section style={{ background: 'var(--ja-card-bg)', border: 'var(--ja-card-border)', borderRadius: 'var(--ja-card-radius)', padding: 'var(--ja-card-padding)' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
          Risk register
        </h2>
        {isEditor && (
          <Button variant="primary" size="sm" onClick={() => { setDraft(EMPTY_DRAFT); setError(null); setAddOpen(true); }}>
            + Add risk
          </Button>
        )}
      </header>

      {error && (
        <div role="alert" style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, fontSize: 13,
          border: '1px solid var(--color-negative, #b91c1c)', color: 'var(--color-negative, #b91c1c)' }}>
          {error}
        </div>
      )}

      {/* Add form */}
      {addOpen && (
        <div style={{ marginBottom: 16, padding: 14, borderRadius: 8, border: '1px dashed var(--color-border-hairline)', background: 'var(--color-surface-muted)' }}>
          <h4 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-tertiary)', margin: '0 0 10px', fontWeight: 700 }}>New risk</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <textarea
              placeholder="Describe the risk…"
              rows={2}
              value={draft.risk}
              onChange={(e) => setDraft((d) => ({ ...d, risk: e.target.value }))}
              style={{ gridColumn: '1 / -1', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border-hairline)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }}
            />
            <Select label="Severity" value={draft.severity} onChange={(v) => setDraft((d) => ({ ...d, severity: v as DraftRisk['severity'] }))}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </Select>
            <Select label="Status" value={draft.status} onChange={(v) => setDraft((d) => ({ ...d, status: v as DraftRisk['status'] }))}>
              <option value="open">Open</option>
              <option value="mitigated">Mitigated</option>
              <option value="closed">Closed</option>
            </Select>
            <textarea
              placeholder="Mitigation plan (optional)…"
              rows={2}
              value={draft.mitigation ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, mitigation: e.target.value || null }))}
              style={{ gridColumn: '1 / -1', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border-hairline)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={addRisk} loading={saving}>Add risk</Button>
          </div>
        </div>
      )}

      {/* Risk table */}
      {risks.length === 0 && !addOpen ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>
          No risks recorded yet.{isEditor && ' Use "+ Add risk" to log the first one.'}
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <Th>Risk</Th>
              <Th w={90}>Severity</Th>
              <Th>Mitigation</Th>
              <Th w={100}>Status</Th>
              {isEditor && <Th w={72}></Th>}
            </tr>
          </thead>
          <tbody>
            {risks.map((r) => {
              const editing = editingId === r.id;
              return (
                <tr key={r.id}>
                  <Td>
                    {editing ? (
                      <textarea value={editDraft.risk ?? r.risk} rows={2}
                        onChange={(e) => setEditDraft((d) => ({ ...d, risk: e.target.value }))}
                        style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid var(--color-border-hairline)', fontSize: 12, resize: 'vertical', fontFamily: 'inherit' }} />
                    ) : r.risk}
                  </Td>
                  <Td>
                    {editing ? (
                      <select value={editDraft.severity ?? r.severity}
                        onChange={(e) => setEditDraft((d) => ({ ...d, severity: e.target.value as DraftRisk['severity'] }))}
                        style={{ fontSize: 12, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--color-border-hairline)' }}>
                        <option value="low">Low</option><option value="medium">Medium</option>
                        <option value="high">High</option><option value="critical">Critical</option>
                      </select>
                    ) : (
                      <span style={{ fontWeight: 700, color: SEVERITY_COLORS[r.severity] }}>{r.severity}</span>
                    )}
                  </Td>
                  <Td>
                    {editing ? (
                      <textarea value={editDraft.mitigation ?? r.mitigation ?? ''} rows={2}
                        onChange={(e) => { const v = e.target.value || null; setEditDraft((d) => ({ ...d, mitigation: v })); }}
                        style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid var(--color-border-hairline)', fontSize: 12, resize: 'vertical', fontFamily: 'inherit' }} />
                    ) : (r.mitigation ?? <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>)}
                  </Td>
                  <Td>
                    {editing ? (
                      <select value={editDraft.status ?? r.status}
                        onChange={(e) => setEditDraft((d) => ({ ...d, status: e.target.value as DraftRisk['status'] }))}
                        style={{ fontSize: 12, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--color-border-hairline)' }}>
                        <option value="open">Open</option><option value="mitigated">Mitigated</option><option value="closed">Closed</option>
                      </select>
                    ) : STATUS_LABELS[r.status]}
                  </Td>
                  {isEditor && (
                    <Td>
                      {editing ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => saveEdit(r.id)} disabled={saving}
                            style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--color-border-hairline)', cursor: 'pointer', background: 'var(--color-accent-lime, #ddec65)', fontWeight: 700 }}>
                            {saving ? '…' : 'Save'}
                          </button>
                          <button onClick={() => setEditingId(null)}
                            style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--color-border-hairline)', cursor: 'pointer', background: 'none' }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => { setEditDraft({}); setEditingId(r.id); }}
                            style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--color-border-hairline)', cursor: 'pointer', background: 'none' }}>
                            Edit
                          </button>
                          <button onClick={() => { if (confirm('Delete this risk?')) void deleteRisk(r.id); }} disabled={saving}
                            style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, border: 'none', cursor: saving ? 'wait' : 'pointer', background: 'none', color: 'var(--color-negative, #b91c1c)' }}>
                            ×
                          </button>
                        </div>
                      )}
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Th({ children, w }: { children?: React.ReactNode; w?: number }) {
  return (
    <th style={{ textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em',
      color: 'var(--color-text-tertiary)', padding: '6px 12px 6px 0', borderBottom: '1px solid var(--color-border-hairline)',
      whiteSpace: 'nowrap', fontWeight: 700, ...(w ? { width: w } : {}) }}>
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td style={{ padding: '8px 12px 8px 0', fontSize: 13, color: 'var(--color-text-primary)',
      borderBottom: '1px solid var(--color-border-subtle)', verticalAlign: 'top' }}>
      {children}
    </td>
  );
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em',
        color: 'var(--color-text-tertiary)', marginBottom: 4, fontWeight: 700 }}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', fontSize: 13, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--color-border-hairline)', background: 'var(--color-surface-base)' }}>
        {children}
      </select>
    </div>
  );
}
