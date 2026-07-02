'use client';

/**
 * V7 T138 — one-form project create.
 *
 * Replaces the 7-step wizard: 14 visible inputs, sensible defaults, one
 * Create button. POSTs the existing /api/projects contract, then (when a
 * target price or the KPC-only preset was chosen) PATCHes the new project
 * once — both existing endpoints, no new server surface. Redirects to the
 * T136 project page on success; everything else is editable there via the
 * edit-assumptions drawer.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { buildPayloads, defaultFormState, type SimpleFormState } from './simple-form-payload';

const MARKET_OPTIONS = [
  { value: 'default', label: 'Unspecified' },
  { value: 'hamptons', label: 'Hamptons' },
  { value: 'east_hampton', label: 'East Hampton' },
  { value: 'south_hampton', label: 'Southampton' },
  { value: 'sag_harbor', label: 'Sag Harbor' },
  { value: 'montauk', label: 'Montauk' },
  { value: 'shelter_island', label: 'Shelter Island' },
  { value: 'north_fork', label: 'North Fork' },
];

const STAGE_OPTIONS = [
  { value: 'tbc', label: 'TBC (default)' },
  { value: 'sourcing', label: 'Sourcing' },
  { value: 'pre_construction', label: 'Pre-construction' },
  { value: 'construction', label: 'Construction' },
  { value: 'sales', label: 'Sales' },
];

function currentYM(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

export function SimpleProjectForm() {
  const router = useRouter();
  const initial = useMemo(() => defaultFormState(currentYM()), []);
  const [form, setForm] = useState<SimpleFormState>(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof SimpleFormState>(key: K, value: SimpleFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    const built = buildPayloads(form);
    setErrors(built.errors);
    setServerError(null);
    if (built.errors.length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(built.create),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? `Create failed (HTTP ${res.status})`);
      }
      const body = (await res.json()) as { data: { projectKey: string } };
      const key = body.data.projectKey;

      // Optional one-shot follow-up: target price / KPC-only financing.
      if (built.patch) {
        const patchRes = await fetch(`/api/projects/${key}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(built.patch),
        });
        if (!patchRes.ok) {
          // The project EXISTS — don't strand the user. Land on the page and
          // surface the drawer for the missing knobs.
          startTransition(() => {
            router.push(`/projects/${key}`);
            router.refresh();
          });
          return;
        }
      }

      startTransition(() => {
        router.push(`/projects/${key}`);
        router.refresh();
      });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        background: 'var(--ja-card-bg)',
        border: 'var(--ja-card-border)',
        borderRadius: 'var(--ja-card-radius)',
        padding: 'var(--ja-card-padding)',
        maxWidth: 760,
      }}
    >
      <header style={{ marginBottom: 20 }}>
        <h1
          style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}
        >
          New project
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
          14 fields, most pre-filled. Everything else inherits globals — edit later from the project
          page.
        </p>
      </header>

      {/* Identity */}
      <Row>
        <Field label="Name" required>
          <input
            style={input}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. 12 Osprey Way"
            autoFocus
          />
        </Field>
        <Field label="Market">
          <select
            style={input}
            value={form.market_id}
            onChange={(e) => set('market_id', e.target.value)}
          >
            {MARKET_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stage">
          <select
            style={input}
            value={form.stage}
            onChange={(e) => set('stage', e.target.value as SimpleFormState['stage'])}
          >
            {STAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </Row>

      {/* Sizing + costs */}
      <SectionLabel>Site &amp; costs</SectionLabel>
      <Row>
        <Field label="Above-grade sqft" required>
          <input
            style={input}
            inputMode="numeric"
            value={form.villa_sqft_ag}
            onChange={(e) => set('villa_sqft_ag', e.target.value)}
            placeholder="4000"
          />
        </Field>
        <Field label="Below-grade sqft">
          <input
            style={input}
            inputMode="numeric"
            value={form.villa_sqft_bg}
            onChange={(e) => set('villa_sqft_bg', e.target.value)}
          />
        </Field>
        <Field label="Land cost (USD)" required>
          <input
            style={input}
            inputMode="numeric"
            value={form.land_cost_usd}
            onChange={(e) => set('land_cost_usd', e.target.value)}
            placeholder="1,500,000"
          />
        </Field>
      </Row>
      <Row>
        <Field label="Build $/sqft" hint="blank = global default">
          <input
            style={input}
            inputMode="numeric"
            value={form.build_cost_per_sqft}
            onChange={(e) => set('build_cost_per_sqft', e.target.value)}
            placeholder="inherit"
          />
        </Field>
        <Field label="Target sale price (USD)" hint="blank = engine-derived">
          <input
            style={input}
            inputMode="numeric"
            value={form.target_sale_price_usd}
            onChange={(e) => set('target_sale_price_usd', e.target.value)}
            placeholder="derived"
          />
        </Field>
        <Field label="Purchase month" required hint="YYYY-MM">
          <input
            style={input}
            value={form.purchase_date}
            onChange={(e) => set('purchase_date', e.target.value)}
            placeholder="2026-07"
          />
        </Field>
      </Row>

      {/* Program */}
      <SectionLabel>Program (months)</SectionLabel>
      <Row>
        <Field label="Sourcing">
          <input
            style={input}
            inputMode="numeric"
            value={form.sourcing_months}
            onChange={(e) => set('sourcing_months', e.target.value)}
          />
        </Field>
        <Field label="Permitting">
          <input
            style={input}
            inputMode="numeric"
            value={form.permitting_months}
            onChange={(e) => set('permitting_months', e.target.value)}
          />
        </Field>
        <Field label="Construction" required>
          <input
            style={input}
            inputMode="numeric"
            value={form.construction_months}
            onChange={(e) => set('construction_months', e.target.value)}
          />
        </Field>
        <Field label="Sales">
          <input
            style={input}
            inputMode="numeric"
            value={form.sales_months}
            onChange={(e) => set('sales_months', e.target.value)}
          />
        </Field>
      </Row>

      {/* Financing preset */}
      <SectionLabel>Financing</SectionLabel>
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <label style={radioLabel}>
          <input
            type="radio"
            name="financing"
            checked={form.financing === 'senior_plus_loc'}
            onChange={() => set('financing', 'senior_plus_loc')}
          />
          Senior debt (75% LTV) + KPC LOC
        </label>
        <label style={radioLabel}>
          <input
            type="radio"
            name="financing"
            checked={form.financing === 'kpc_only'}
            onChange={() => set('financing', 'kpc_only')}
          />
          KPC LOC only (no senior debt)
        </label>
      </div>

      {/* Errors */}
      {(errors.length > 0 || serverError) && (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            marginBottom: 16,
            borderRadius: 8,
            border: '1px solid var(--color-border-hairline)',
            borderLeft: '3px solid var(--color-negative, #b91c1c)',
            fontSize: 12.5,
            color: 'var(--color-text-secondary)',
          }}
        >
          {serverError ?? errors.join(' ')}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={() => router.push('/projects')} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} loading={submitting || pending}>
          Create project
        </Button>
      </div>
    </div>
  );
}

// ── Layout primitives (local) ────────────────────────────────────────────────

const input: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid var(--color-border-hairline)',
  background: 'var(--color-surface-base)',
  color: 'var(--color-text-primary)',
};

const radioLabel: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  color: 'var(--color-text-primary)',
  cursor: 'pointer',
};

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--color-text-tertiary)',
        margin: '18px 0 10px',
      }}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
        {label}
        {required && <span style={{ color: 'var(--color-negative, #b91c1c)' }}> *</span>}
        {hint && (
          <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)' }}> · {hint}</span>
        )}
      </span>
      {children}
    </label>
  );
}
