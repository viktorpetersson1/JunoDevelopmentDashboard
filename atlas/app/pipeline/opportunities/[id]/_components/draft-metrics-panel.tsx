'use client';

/**
 * V7 T145 — "Ask Juno to draft key metrics" (wires T140's button).
 *
 * Click → POST /api/opportunities/[id]/draft-metrics → the returned draft
 * PRE-FILLS an editable form the user reviews; the model's reasoning renders
 * under it. NOTHING persists until the user presses Save, which PATCHes the
 * existing /api/opportunities/[id] route (the same validated write path as
 * every other edit).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import type { DraftMetrics } from '@/lib/agent/draft-metrics';

export function DraftMetricsPanel({
  opportunityId,
  disabled,
}: {
  opportunityId: string;
  /** True for viewers / promoted records — renders the inert button. */
  disabled: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<DraftMetrics | null>(null);
  const [form, setForm] = useState({
    cash: '',
    months: '',
    profit: '',
    margin: '',
    nextStep: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const requestDraft = async () => {
    setDrafting(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}/draft-metrics`, {
        method: 'POST',
      });
      const body = (await res.json().catch(() => null)) as {
        data?: { draft: DraftMetrics };
        error?: { message?: string };
      } | null;
      if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      const d = body!.data!.draft;
      setDraft(d);
      setForm({
        cash: d.cash_needed_usd !== null ? String(d.cash_needed_usd) : '',
        months: d.timeline_months !== null ? String(d.timeline_months) : '',
        profit: d.expected_profit_usd !== null ? String(d.expected_profit_usd) : '',
        margin: d.expected_margin_pct !== null ? String(d.expected_margin_pct) : '',
        nextStep: d.next_step ?? '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDrafting(false);
    }
  };

  const num = (s: string): number | null => {
    const n = Number(s.replace(/[$,%\s]/g, ''));
    return s.trim() !== '' && Number.isFinite(n) ? n : null;
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cash_needed_usd: num(form.cash),
          timeline_months: num(form.months) !== null ? Math.round(num(form.months)!) : null,
          expected_profit_usd: num(form.profit),
          expected_margin_pct: num(form.margin),
          next_step: form.nextStep.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      setSaved(true);
      setDraft(null);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button
          variant="secondary"
          size="sm"
          onClick={requestDraft}
          loading={drafting}
          disabled={disabled}
          title={
            disabled ? 'Read-only record' : 'Draft the deal-sheet metrics from the research notes'
          }
        >
          Ask Juno to draft key metrics
        </Button>
        {saved && (
          <span role="status" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            Saved.
          </span>
        )}
      </div>

      {error && (
        <p
          role="alert"
          style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--color-negative, #b91c1c)' }}
        >
          {error}
        </p>
      )}

      {draft && (
        <div
          style={{
            marginTop: 12,
            padding: 14,
            border: '1px solid var(--color-border-hairline)',
            borderRadius: 10,
          }}
        >
          <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Draft — review, edit, then Save. Nothing is stored until you save.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 10,
            }}
          >
            <Field label="Cash needed (USD)">
              <input
                style={inp}
                inputMode="numeric"
                value={form.cash}
                onChange={(e) => setForm((f) => ({ ...f, cash: e.target.value }))}
                placeholder="unknown"
              />
            </Field>
            <Field label="Timeline (months)">
              <input
                style={inp}
                inputMode="numeric"
                value={form.months}
                onChange={(e) => setForm((f) => ({ ...f, months: e.target.value }))}
                placeholder="unknown"
              />
            </Field>
            <Field label="Expected profit (USD)">
              <input
                style={inp}
                inputMode="numeric"
                value={form.profit}
                onChange={(e) => setForm((f) => ({ ...f, profit: e.target.value }))}
                placeholder="unknown"
              />
            </Field>
            <Field label="Expected margin (%)">
              <input
                style={inp}
                inputMode="numeric"
                value={form.margin}
                onChange={(e) => setForm((f) => ({ ...f, margin: e.target.value }))}
                placeholder="unknown"
              />
            </Field>
          </div>
          <Field label="Suggested next step">
            <input
              style={{ ...inp, width: '100%' }}
              value={form.nextStep}
              onChange={(e) => setForm((f) => ({ ...f, nextStep: e.target.value }))}
            />
          </Field>

          <div
            style={{
              marginTop: 10,
              padding: '8px 12px',
              borderLeft: '2px solid var(--color-border-hairline)',
              fontSize: 12.5,
              color: 'var(--color-text-secondary)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {draft.reasoning}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={saving}>
              Discard
            </Button>
            <Button variant="primary" size="sm" onClick={save} loading={saving}>
              Save to opportunity
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const inp: React.CSSProperties = {
  padding: '7px 9px',
  fontSize: 12.5,
  borderRadius: 7,
  border: '1px solid var(--color-border-hairline)',
  background: 'var(--color-surface-base)',
  color: 'var(--color-text-primary)',
};
