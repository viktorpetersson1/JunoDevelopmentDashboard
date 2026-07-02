'use client';

/**
 * Settings → Capital Sources tab (V6.2 T118).
 *
 * Super-admin-only surface for the versioned capital-sources ledger.
 * Lists current (non-archived) sources, opens an editor Modal for add/edit,
 * and offers archive on each row.
 *
 * Mutations all go through E1-gated /api/capital-sources endpoints.
 * Audit happens server-side via the service layer.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/app/projects/new/_components/field';
import { formatMoney } from '@/lib/utils/money';
import type { CapitalSourceView, SourceKind } from '@/lib/repos/capital-sources';

const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  kpc_loc: 'KPC LOC',
  project_finance: 'Project finance',
  recycled_equity: 'Recycled equity',
};

type Num = number | null;
type Str = string | null;

interface FormState {
  sourceKind: SourceKind;
  sourceName: Str;
  limitUsd: Num;
  drawnUsd: Num;
  interestRateDisplayPct: Num; // percent UI; sent as decimal (÷100)
  notes: Str;
  covenantMaxLtcDisplayPct: Num; // percent UI; sent as decimal
  covenantMaxConcurrentProjects: Num;
  drawWindowStartDate: Str; // YYYY-MM-DD
  drawWindowEndDate: Str;
  priorityOrder: Num;
}

function emptyForm(): FormState {
  return {
    sourceKind: 'kpc_loc',
    sourceName: '',
    limitUsd: null,
    drawnUsd: 0,
    interestRateDisplayPct: null,
    notes: null,
    covenantMaxLtcDisplayPct: null,
    covenantMaxConcurrentProjects: null,
    drawWindowStartDate: null,
    drawWindowEndDate: null,
    priorityOrder: 0,
  };
}

function toForm(s: CapitalSourceView): FormState {
  const pct = (v: number | null | undefined) => (v == null ? null : Math.round(v * 1000) / 10); // decimal→pct, 1dp
  return {
    sourceKind: s.sourceKind,
    sourceName: s.sourceName,
    limitUsd: s.limitUsd,
    drawnUsd: s.drawnUsd,
    interestRateDisplayPct: pct(s.interestRatePct),
    notes: s.notes,
    covenantMaxLtcDisplayPct: pct(s.covenantMaxLtcPct),
    covenantMaxConcurrentProjects: s.covenantMaxConcurrentProjects,
    drawWindowStartDate: s.drawWindowStartDate,
    drawWindowEndDate: s.drawWindowEndDate,
    priorityOrder: s.priorityOrder,
  };
}

function toPayload(f: FormState): Record<string, unknown> {
  const dec = (v: Num) => (v == null ? null : v / 100);
  const body: Record<string, unknown> = {
    sourceKind: f.sourceKind,
    sourceName: f.sourceName,
    limitUsd: f.limitUsd,
    drawnUsd: f.drawnUsd,
    interestRatePct: dec(f.interestRateDisplayPct),
    notes: f.notes,
    covenantMaxLtcPct: dec(f.covenantMaxLtcDisplayPct),
    covenantMaxConcurrentProjects: f.covenantMaxConcurrentProjects,
    drawWindowStartDate: f.drawWindowStartDate,
    drawWindowEndDate: f.drawWindowEndDate,
    priorityOrder: f.priorityOrder ?? 0,
  };
  return body;
}

export function CapitalSourcesTab({ sources }: { sources: CapitalSourceView[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
    setOpen(true);
  }

  function openEdit(s: CapitalSourceView) {
    setEditingId(s.id);
    setForm(toForm(s));
    setError(null);
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const isUpdate = editingId !== null;
      const url = isUpdate ? `/api/capital-sources/${editingId}` : '/api/capital-sources';
      const res = await fetch(url, {
        method: isUpdate ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(form)),
      });
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setError(json?.error?.message ?? `Save failed (HTTP ${res.status})`);
        setSaving(false);
        return;
      }
      setSaving(false);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      setSaving(false);
    }
  }

  async function archive(s: CapitalSourceView) {
    if (!confirm(`Archive ${s.sourceName}? It will be hidden from the active ledger.`)) return;
    try {
      const res = await fetch(`/api/capital-sources/${s.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        alert(json?.error?.message ?? `Archive failed (HTTP ${res.status})`);
        return;
      }
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Network error');
    }
  }

  return (
    <section
      style={{
        background: 'var(--ja-card-bg)',
        border: 'var(--ja-card-border)',
        borderRadius: 'var(--ja-card-radius)',
        padding: 'var(--ja-card-padding)',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 16,
        }}
      >
        <div>
          <h2
            style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}
          >
            Capital sources
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Versioned ledger of every funding facility — KPC LOC, project-finance senior debt,
            recycled equity. Edit writes a new version; archive hides without deleting.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={openCreate}>
          + Add source
        </Button>
      </header>

      {sources.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>
          No capital sources configured yet. Add one to start tracking headroom and covenants.
        </p>
      ) : (
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
              <Th>Source</Th>
              <Th align="right">Limit</Th>
              <Th align="right">Drawn</Th>
              <Th align="right">Headroom</Th>
              <Th align="right">Rate</Th>
              <Th align="right">Max LTC</Th>
              <Th align="right">Max projects</Th>
              <Th align="right">v</Th>
              <Th align="right"></Th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id}>
                <Td>
                  <div style={{ fontWeight: 700 }}>{s.sourceName}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                    {SOURCE_KIND_LABELS[s.sourceKind]} · priority {s.priorityOrder}
                  </div>
                </Td>
                <Td align="right">
                  {formatMoney(s.limitUsd * 100, { compact: true, precision: 2 })}
                </Td>
                <Td align="right">
                  {formatMoney(s.drawnUsd * 100, { compact: true, precision: 2 })}
                </Td>
                <Td align="right" emphatic>
                  {formatMoney(s.headroomUsd * 100, { compact: true, precision: 2 })}
                </Td>
                <Td align="right">
                  {s.interestRatePct == null ? '—' : `${(s.interestRatePct * 100).toFixed(2)}%`}
                </Td>
                <Td align="right">
                  {s.covenantMaxLtcPct == null ? '—' : `${(s.covenantMaxLtcPct * 100).toFixed(1)}%`}
                </Td>
                <Td align="right">{s.covenantMaxConcurrentProjects ?? '—'}</Td>
                <Td align="right">{s.version}</Td>
                <Td align="right">
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => openEdit(s)}
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 4,
                        border: '1px solid var(--color-border-hairline)',
                        cursor: 'pointer',
                        background: 'none',
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => archive(s)}
                      title="Archive"
                      style={{
                        fontSize: 13,
                        padding: '0 4px',
                        border: 'none',
                        cursor: 'pointer',
                        background: 'none',
                        color: 'var(--color-negative, #b91c1c)',
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={open}
        onClose={() => {
          if (!saving) setOpen(false);
        }}
        title={editingId ? 'Edit capital source (writes new version)' : 'Add capital source'}
        description={
          editingId
            ? 'Each save mints a new version row. Prior versions stay queryable for audit.'
            : 'Versioned ledger entry. Covenants are optional but recommended.'
        }
        size="lg"
        dismissOnBackdrop={!saving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              {editingId ? 'Save new version' : 'Add source'}
            </Button>
          </>
        }
      >
        {error && (
          <div
            role="alert"
            style={{
              marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--color-negative, #b91c1c)',
              color: 'var(--color-negative, #b91c1c)',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <FormSection title="Source">
            <div>
              <label style={fieldLabelStyle}>Source kind</label>
              <select
                value={form.sourceKind}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sourceKind: e.target.value as SourceKind }))
                }
                style={selectStyle}
              >
                <option value="kpc_loc">KPC LOC</option>
                <option value="project_finance">Project finance</option>
                <option value="recycled_equity">Recycled equity</option>
              </select>
            </div>
            <Field
              label="Source name"
              name="sourceName"
              kind="text"
              required
              value={form.sourceName}
              onChange={(v) => setForm((f) => ({ ...f, sourceName: v as Str }))}
            />
          </FormSection>

          <FormSection title="Amounts">
            <Field
              label="Facility limit (USD)"
              name="limitUsd"
              kind="number"
              min={0}
              suffix="$"
              required
              value={form.limitUsd}
              onChange={(v) => setForm((f) => ({ ...f, limitUsd: v as Num }))}
            />
            <Field
              label="Currently drawn (USD)"
              name="drawnUsd"
              kind="number"
              min={0}
              suffix="$"
              value={form.drawnUsd}
              onChange={(v) => setForm((f) => ({ ...f, drawnUsd: v as Num }))}
            />
            <Field
              label="Interest rate (APR)"
              name="interestRatePct"
              kind="number"
              min={0}
              max={100}
              suffix="%"
              hint="Annual percentage rate, e.g. 6 for 6%"
              value={form.interestRateDisplayPct}
              onChange={(v) => setForm((f) => ({ ...f, interestRateDisplayPct: v as Num }))}
            />
          </FormSection>

          <FormSection title="Covenants (optional)">
            <Field
              label="Max LTC"
              name="covenantMaxLtcPct"
              kind="number"
              min={0}
              max={100}
              suffix="%"
              hint="Debt outstanding / total project cost ≤ this. Blank = no covenant enforced."
              value={form.covenantMaxLtcDisplayPct}
              onChange={(v) => setForm((f) => ({ ...f, covenantMaxLtcDisplayPct: v as Num }))}
            />
            <Field
              label="Max concurrent projects"
              name="covenantMaxConcurrentProjects"
              kind="integer"
              min={0}
              hint="How many active-debt projects this source can fund at once."
              value={form.covenantMaxConcurrentProjects}
              onChange={(v) => setForm((f) => ({ ...f, covenantMaxConcurrentProjects: v as Num }))}
            />
          </FormSection>

          <FormSection title="Draw window (optional)">
            <Field
              label="Earliest draw date"
              name="drawWindowStartDate"
              kind="text"
              hint="YYYY-MM-DD"
              value={form.drawWindowStartDate}
              onChange={(v) => setForm((f) => ({ ...f, drawWindowStartDate: v as Str }))}
            />
            <Field
              label="Latest draw date"
              name="drawWindowEndDate"
              kind="text"
              hint="YYYY-MM-DD"
              value={form.drawWindowEndDate}
              onChange={(v) => setForm((f) => ({ ...f, drawWindowEndDate: v as Str }))}
            />
          </FormSection>

          <FormSection title="Priority & notes">
            <Field
              label="Funding-stack priority"
              name="priorityOrder"
              kind="integer"
              min={0}
              max={100}
              hint="Lower drawn first. 0 = highest priority."
              value={form.priorityOrder}
              onChange={(v) => setForm((f) => ({ ...f, priorityOrder: v as Num }))}
            />
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={fieldLabelStyle}>Notes</label>
              <textarea
                value={form.notes ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value || null }))}
                rows={3}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--color-border-hairline)',
                  fontSize: 13,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          </FormSection>
        </div>
      </Modal>
    </section>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--color-text-tertiary)',
  marginBottom: 4,
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 13,
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid var(--color-border-hairline)',
  background: 'var(--color-surface-base)',
};

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-text-tertiary)',
          margin: '0 0 10px',
          fontWeight: 700,
        }}
      >
        {title}
      </h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        {children}
      </div>
    </section>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      style={{
        textAlign: align,
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--color-text-tertiary)',
        padding: '6px 12px 6px 0',
        borderBottom: '1px solid var(--color-border-hairline)',
        whiteSpace: 'nowrap',
        fontWeight: 700,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  emphatic = false,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  emphatic?: boolean;
}) {
  return (
    <td
      style={{
        padding: '8px 12px 8px 0',
        borderBottom: '1px solid var(--color-border-subtle)',
        verticalAlign: 'top',
        textAlign: align,
        fontWeight: emphatic ? 700 : 400,
        color: 'var(--color-text-primary)',
      }}
    >
      {children}
    </td>
  );
}
