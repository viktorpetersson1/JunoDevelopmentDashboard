'use client';

/**
 * V4.11b — Settings → General tab: real editor for the scalar globals.
 *
 * Edits the singleton atlas.globals row via /api/globals. Null per
 * field = "use baseline default" (the blank text input). Only editor+
 * can save; viewers see the form disabled but still read the current
 * values.
 *
 * Deferred to V4.11c (a follow-up sprint that needs its own UI work):
 *   - Markets editor (array of market objects — V4 INVENTORY §23 lists
 *     6 markets with per-market multipliers)
 *   - Risk thresholds editor (6 thresholds — needs new risk_thresholds
 *     table)
 *   - Cash equity ratio, equity at closing, annual OPEX, OPEX growth
 *     (not yet on Globals type)
 *   - Data export / theme / shareholders / hypothetical LP
 *
 * What ships today: the 16 scalar fields the calc engine already reads.
 * Editing one of them changes every portfolio surface's aggregator run
 * immediately on next page render (see lib/globals/active.ts).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Globals } from '@/lib/calc/project/types';
import { MarketsEditor, type MarketRow } from './markets-editor';

interface Props {
  /** Server-fetched initial active globals so the form hydrates cleanly. */
  initialGlobals: Globals;
  /** True when nothing in the DB row is non-null — UI shows "baseline" badge. */
  initialIsBaseline: boolean;
  /** ISO timestamp; null when no override row exists. */
  initialUpdatedAt: string | null;
  /** Whether the current user is editor or super_admin. */
  canEdit: boolean;
  /** V4.11c — true when atlas.globals.markets is null (i.e. inherited
   *  from baseline). Shown as a label on the markets editor. */
  isBaselineMarkets: boolean;
}

// String-form state so blank inputs cleanly represent "use baseline".
// Conversion to typed payload happens at submit time.
interface FormState {
  interest_rate_apr: string;
  ltc_pct: string;
  ltc_land_pct: string;
  contingency_pct: string;
  default_build_cost_per_sqft: string;
  default_kingshaus_cost_per_sqft: string;
  target_margin: string;
  default_program_months: string;
  model_start: string;
  horizon_months: string;
  capitalize_interest: 'on' | 'off' | 'baseline';
  financing_fees_per_project_usd: string;
  build_cost_curve: 'linear' | 's_curve' | 'front_loaded' | 'baseline';
  build_cost_realization_pct: string;
  risk_safe_ltc_pct: string;
  risk_sales_delay_grace_months: string;
  risk_cost_overrun_ratio: string;
  risk_equity_cluster_pctile: string;
  risk_sale_downside_haircut: string;
  include_sold_projects: 'on' | 'off' | 'baseline';
}

function formFromGlobals(g: Globals): FormState {
  return {
    interest_rate_apr: String(g.interest_rate_apr),
    ltc_pct: String(g.ltc_pct),
    ltc_land_pct: String(g.ltc_land_pct),
    contingency_pct: String(g.contingency_pct),
    default_build_cost_per_sqft: String(g.default_build_cost_per_sqft),
    default_kingshaus_cost_per_sqft: String(g.default_kingshaus_cost_per_sqft ?? 0),
    target_margin: String(g.target_margin),
    default_program_months: String(g.default_program_months),
    model_start: g.model_start,
    horizon_months: String(g.horizon_months),
    capitalize_interest: g.capitalize_interest ? 'on' : 'off',
    financing_fees_per_project_usd: String(g.financing_fees_per_project_usd ?? 0),
    build_cost_curve: (g.build_cost_curve ?? 'linear') as FormState['build_cost_curve'],
    build_cost_realization_pct: String(g.build_cost_realization_pct ?? 1),
    risk_safe_ltc_pct: String(g.risk_safe_ltc_pct ?? 0.85),
    risk_sales_delay_grace_months: String(g.risk_sales_delay_grace_months ?? 1),
    risk_cost_overrun_ratio: String(g.risk_cost_overrun_ratio ?? 1.05),
    risk_equity_cluster_pctile: String(g.risk_equity_cluster_pctile ?? 0.9),
    risk_sale_downside_haircut: String(g.risk_sale_downside_haircut ?? 0.9),
    include_sold_projects: g.include_sold_projects ? 'on' : 'off',
  };
}

export function GeneralTab({
  initialGlobals,
  initialIsBaseline,
  initialUpdatedAt,
  canEdit,
  isBaselineMarkets,
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(formFromGlobals(initialGlobals));
  const [busy, setBusy] = useState<'save' | 'reset' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBaseline, setIsBaseline] = useState(initialIsBaseline);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);

  useEffect(() => {
    setForm(formFromGlobals(initialGlobals));
    setIsBaseline(initialIsBaseline);
    setUpdatedAt(initialUpdatedAt);
  }, [initialGlobals, initialIsBaseline, initialUpdatedAt]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((s) => ({ ...s, [key]: value }));
  };

  const save = async () => {
    if (!canEdit) return;
    setBusy('save');
    setError(null);
    try {
      const payload = buildPayload(form);
      const res = await fetch('/api/globals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(e?.error?.message ?? `${res.status} ${res.statusText}`);
      }
      const body = (await res.json()) as { isBaseline: boolean; updatedAt: string | null };
      setIsBaseline(body.isBaseline);
      setUpdatedAt(body.updatedAt);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const resetToBaseline = async () => {
    if (!canEdit) return;
    if (!confirm('Reset every global to the baseline defaults? This drops every saved override.')) return;
    setBusy('reset');
    setError(null);
    try {
      const res = await fetch('/api/globals', { method: 'DELETE' });
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(e?.error?.message ?? `${res.status} ${res.statusText}`);
      }
      const body = (await res.json()) as { globals: Globals; isBaseline: boolean; updatedAt: string | null };
      setForm(formFromGlobals(body.globals));
      setIsBaseline(body.isBaseline);
      setUpdatedAt(body.updatedAt);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div
        role="status"
        style={{
          padding: '12px 16px',
          background: isBaseline ? 'var(--color-surface-raised)' : 'var(--color-accent-lime, #ddec65)',
          border: '1px solid var(--color-border-hairline)',
          borderLeft: `3px solid ${isBaseline ? 'var(--color-border-strong)' : 'var(--color-accent-base, #131313)'}`,
          borderRadius: 10,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <strong
            style={{
              fontSize: 13,
              color: isBaseline ? 'var(--color-text-primary)' : 'var(--color-text-on-lime, #0d0d0d)',
            }}
          >
            {isBaseline ? 'Using baseline defaults' : 'Custom overrides active'}
          </strong>
          <p style={{ margin: '4px 0 0 0', fontSize: 12, color: isBaseline ? 'var(--color-text-secondary)' : 'var(--color-text-on-lime, #0d0d0d)' }}>
            {isBaseline
              ? 'Every portfolio page is running off the constants in lib/calc/baselines.ts.'
              : `Last updated ${updatedAt ? new Date(updatedAt).toLocaleString() : 'recently'}. Resetting reverts every field.`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canEdit && !isBaseline && (
            <SecondaryButton onClick={resetToBaseline} disabled={busy != null}>
              Reset to baseline
            </SecondaryButton>
          )}
          {canEdit && (
            <PrimaryButton onClick={save} disabled={busy != null}>
              Save changes
            </PrimaryButton>
          )}
        </div>
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

      {!canEdit && (
        <div
          role="status"
          style={{
            padding: '8px 12px',
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border-hairline)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--color-text-secondary)',
          }}
        >
          Read-only: only editor and super-admin can change globals.
        </div>
      )}

      <Section title="Financial assumptions">
        <Grid>
          <Field label="Interest rate (APR, fraction)">
            <NumberInput value={form.interest_rate_apr} onChange={(v) => update('interest_rate_apr', v)} step="0.001" disabled={!canEdit} />
          </Field>
          <Field label="LTC (build / soft)">
            <NumberInput value={form.ltc_pct} onChange={(v) => update('ltc_pct', v)} step="0.01" disabled={!canEdit} />
          </Field>
          <Field label="LTC (land)">
            <NumberInput value={form.ltc_land_pct} onChange={(v) => update('ltc_land_pct', v)} step="0.01" disabled={!canEdit} />
          </Field>
          <Field label="Contingency %">
            <NumberInput value={form.contingency_pct} onChange={(v) => update('contingency_pct', v)} step="0.005" disabled={!canEdit} />
          </Field>
          <Field label="Target margin">
            <NumberInput value={form.target_margin} onChange={(v) => update('target_margin', v)} step="0.01" disabled={!canEdit} />
          </Field>
          <Field label="Financing fees / project (USD)">
            <NumberInput value={form.financing_fees_per_project_usd} onChange={(v) => update('financing_fees_per_project_usd', v)} step="1000" disabled={!canEdit} />
          </Field>
          <Field label="Capitalize interest">
            <SelectInput
              value={form.capitalize_interest}
              onChange={(v) => update('capitalize_interest', v as FormState['capitalize_interest'])}
              options={[
                { value: 'on', label: 'Yes (capitalize)' },
                { value: 'off', label: 'No (expense)' },
              ]}
              disabled={!canEdit}
            />
          </Field>
        </Grid>
      </Section>

      <Section title="Build cost defaults">
        <Grid>
          <Field label="Default build $/sqft">
            <NumberInput value={form.default_build_cost_per_sqft} onChange={(v) => update('default_build_cost_per_sqft', v)} step="10" disabled={!canEdit} />
          </Field>
          <Field label="Default Kingshaus $/sqft">
            <NumberInput value={form.default_kingshaus_cost_per_sqft} onChange={(v) => update('default_kingshaus_cost_per_sqft', v)} step="10" disabled={!canEdit} />
          </Field>
          <Field label="Build cost curve">
            <SelectInput
              value={form.build_cost_curve}
              onChange={(v) => update('build_cost_curve', v as FormState['build_cost_curve'])}
              options={[
                { value: 'linear', label: 'Linear' },
                { value: 's_curve', label: 'S-curve' },
                { value: 'front_loaded', label: 'Front-loaded' },
              ]}
              disabled={!canEdit}
            />
          </Field>
          <Field label="Build cost realization %">
            <NumberInput value={form.build_cost_realization_pct} onChange={(v) => update('build_cost_realization_pct', v)} step="0.05" disabled={!canEdit} />
          </Field>
        </Grid>
      </Section>

      <Section title="Schedule + horizon">
        <Grid>
          <Field label="Default program months">
            <NumberInput value={form.default_program_months} onChange={(v) => update('default_program_months', v)} step="1" disabled={!canEdit} />
          </Field>
          <Field label="Model start (YYYY-MM)">
            <TextInput value={form.model_start} onChange={(v) => update('model_start', v)} disabled={!canEdit} placeholder="2026-01" />
          </Field>
          <Field label="Horizon (months)">
            <NumberInput value={form.horizon_months} onChange={(v) => update('horizon_months', v)} step="1" disabled={!canEdit} />
          </Field>
          <Field label="Include sold projects in roll-up">
            <SelectInput
              value={form.include_sold_projects}
              onChange={(v) => update('include_sold_projects', v as FormState['include_sold_projects'])}
              options={[
                { value: 'on', label: 'Yes' },
                { value: 'off', label: 'No' },
              ]}
              disabled={!canEdit}
            />
          </Field>
        </Grid>
      </Section>

      <Section title="Risk thresholds">
        <Grid>
          <Field label="Safe LTC ceiling">
            <NumberInput value={form.risk_safe_ltc_pct} onChange={(v) => update('risk_safe_ltc_pct', v)} step="0.01" disabled={!canEdit} />
          </Field>
          <Field label="Sales delay grace (months)">
            <NumberInput value={form.risk_sales_delay_grace_months} onChange={(v) => update('risk_sales_delay_grace_months', v)} step="1" disabled={!canEdit} />
          </Field>
          <Field label="Cost overrun ratio">
            <NumberInput value={form.risk_cost_overrun_ratio} onChange={(v) => update('risk_cost_overrun_ratio', v)} step="0.01" disabled={!canEdit} />
          </Field>
          <Field label="Equity cluster pctile">
            <NumberInput value={form.risk_equity_cluster_pctile} onChange={(v) => update('risk_equity_cluster_pctile', v)} step="0.05" disabled={!canEdit} />
          </Field>
          <Field label="Sale downside haircut">
            <NumberInput value={form.risk_sale_downside_haircut} onChange={(v) => update('risk_sale_downside_haircut', v)} step="0.05" disabled={!canEdit} />
          </Field>
        </Grid>
        <p style={{ margin: '8px 0 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Tunes the /risks engine. Defaults: 0.85 / 1 / 1.05 / 0.9 / 0.9.
        </p>
      </Section>

      {/* V4.11c — Markets editor. Lives below the scalar form so users
          see the high-impact settings first. */}
      <MarketsEditor
        initialMarkets={(initialGlobals.markets ?? []) as MarketRow[]}
        isBaselineMarkets={isBaselineMarkets}
        canEdit={canEdit}
      />

      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
        Shareholders, OPEX, hypothetical LP, and data export ship in V4.11d.
      </p>
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 12,
        padding: 16,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {title}
      </h3>
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 16,
      }}
    >
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  step,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  step?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      value={value}
      step={step}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={inputStyle}
    />
  );
}

function TextInput({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={inputStyle}
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} style={inputStyle}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 14px',
        background: 'var(--color-accent-base, #131313)',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 14px',
        background: 'transparent',
        color: 'var(--color-text-primary)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 13,
  border: '1px solid var(--color-border-hairline)',
  borderRadius: 8,
  background: 'var(--color-surface-base)',
  color: 'var(--color-text-primary)',
};

/** Convert the string-form state into the typed PATCH payload. Empty
 *  strings become null (clear the override → fall back to baseline). */
function buildPayload(form: FormState): Record<string, unknown> {
  const num = (s: string): number | null => {
    if (s === '' || s == null) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const int = (s: string): number | null => {
    const n = num(s);
    return n == null ? null : Math.round(n);
  };
  const boolFrom = (v: 'on' | 'off' | 'baseline'): boolean | null =>
    v === 'baseline' ? null : v === 'on';
  const enumFrom = <T extends string>(v: T | 'baseline'): T | null =>
    v === 'baseline' ? null : (v as T);

  return {
    interest_rate_apr: num(form.interest_rate_apr),
    ltc_pct: num(form.ltc_pct),
    ltc_land_pct: num(form.ltc_land_pct),
    contingency_pct: num(form.contingency_pct),
    default_build_cost_per_sqft: num(form.default_build_cost_per_sqft),
    default_kingshaus_cost_per_sqft: num(form.default_kingshaus_cost_per_sqft),
    target_margin: num(form.target_margin),
    default_program_months: int(form.default_program_months),
    model_start: form.model_start === '' ? null : form.model_start,
    horizon_months: int(form.horizon_months),
    capitalize_interest: boolFrom(form.capitalize_interest),
    financing_fees_per_project_usd: num(form.financing_fees_per_project_usd),
    build_cost_curve: enumFrom(form.build_cost_curve),
    build_cost_realization_pct: num(form.build_cost_realization_pct),
    risk_safe_ltc_pct: num(form.risk_safe_ltc_pct),
    risk_sales_delay_grace_months: int(form.risk_sales_delay_grace_months),
    risk_cost_overrun_ratio: num(form.risk_cost_overrun_ratio),
    risk_equity_cluster_pctile: num(form.risk_equity_cluster_pctile),
    risk_sale_downside_haircut: num(form.risk_sale_downside_haircut),
    include_sold_projects: boolFrom(form.include_sold_projects),
  };
}
