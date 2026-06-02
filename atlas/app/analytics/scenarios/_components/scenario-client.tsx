'use client';

/**
 * V4.5 — Scenarios client component.
 *
 * Hosts the active-scenario form, project exclusions, KPI comparison
 * vs base, variance drivers, and saved-scenarios list. Calls
 * /api/scenarios/preview to recompute KPIs on Apply (no persistence)
 * and /api/scenarios to Save / Duplicate / Update.
 *
 * Form state is local; the "active" scenario starts as the base case
 * defaults but can be loaded from any saved scenario by clicking it.
 */

import { useMemo, useState, useTransition } from 'react';
import type { Scenario } from '@/lib/calc/project/types';
import type { ScenarioView, ScenarioClass } from '@/lib/repos/scenarios';
import { ScenarioOverlayChart } from './scenario-overlay-chart';

const CLASS_OPTIONS: { value: ScenarioClass; label: string }[] = [
  { value: 'base', label: 'Base case' },
  { value: 'lender', label: 'Lender case' },
  { value: 'upside', label: 'Upside' },
  { value: 'downside', label: 'Downside' },
  { value: 'custom', label: 'Custom' },
];

const KPI_LABELS: Record<keyof KpiBag, string> = {
  total_profit_before_tax: 'Total profit (pre-tax)',
  peak_equity_required: 'Peak equity',
  max_debt_outstanding: 'Max debt',
  total_sales: 'Total sales',
  total_interest: 'Total interest',
  moic_gross: 'Gross MOIC',
};

interface KpiBag {
  total_profit_before_tax: number;
  peak_equity_required: number;
  max_debt_outstanding: number;
  total_sales: number;
  total_interest: number;
  moic_gross: number;
}

interface ProjectLite {
  id: string;
  name: string;
  startDate: string | null;
}

interface FormState {
  /** Tracks the ID of the saved scenario currently loaded into the form.
   *  null = base case or unsaved draft. */
  loadedId: string | null;
  name: string;
  class: ScenarioClass;
  locked: boolean;
  interest_rate_delta_bps: number;
  build_cost_multiplier: number;
  sale_price_multiplier: number;
  margin_override: number | null;
  timing_shift_months: number;
  excluded_project_ids: string[];
}

interface Props {
  projects: ProjectLite[];
  savedScenarios: ScenarioView[];
  baseScenario: Scenario;
  baseKpis: KpiBag;
  /** V4.5b — base IRR + payback for the extended cross-scenario table. */
  baseExtendedKpis?: { irr_annual: number | null; payback_months: number | null };
  /** V4.5b — pre-computed KPIs per saved scenario for the comparison table.
   *  Server-side compute so the page renders without client aggregator work.
   *  V4.5c — `series` field added for the overlay charts.
   *  V4.5d — `annual` field added for the annual P&L table. */
  savedKpis?: Array<{
    id: string;
    name: string;
    class: string;
    locked: boolean;
    kpis: KpiBag & { irr_annual: number | null; payback_months: number | null };
    series?: { cumEquityDrawn: number[]; netCash: number[] };
    annual?: Record<string, { sales: number; profit_before_tax: number }>;
  }>;
  /** V4.5c — base case monthly series for the overlay charts. */
  baseSeries?: { dates: string[]; cumEquityDrawn: number[]; netCash: number[] };
  /** V4.5d — base case per-FY breakdown for the annual P&L table. */
  baseAnnual?: Record<string, { sales: number; profit_before_tax: number }>;
  canEdit: boolean;
}

const STRESS_PRESET: Partial<FormState> = {
  interest_rate_delta_bps: 200,
  build_cost_multiplier: 1.1,
  sale_price_multiplier: 0.95,
  margin_override: null,
  timing_shift_months: 3,
};

const OPTIMISTIC_PRESET: Partial<FormState> = {
  interest_rate_delta_bps: -100,
  build_cost_multiplier: 0.95,
  sale_price_multiplier: 1.05,
  margin_override: null,
  timing_shift_months: -2,
};

function initialFromBase(base: Scenario): FormState {
  return {
    loadedId: null,
    name: base.name ?? 'Base case',
    class: (base.class ?? 'base') as ScenarioClass,
    locked: base.locked ?? false,
    interest_rate_delta_bps: base.interest_rate_delta_bps ?? 0,
    build_cost_multiplier: base.build_cost_multiplier ?? 1,
    sale_price_multiplier: base.sale_price_multiplier ?? 1,
    margin_override: base.margin_override ?? null,
    timing_shift_months: base.timing_shift_months ?? 0,
    excluded_project_ids: [...(base.excluded_project_ids ?? [])],
  };
}

function fromSaved(s: ScenarioView): FormState {
  return {
    loadedId: s.id,
    name: s.name,
    class: s.class,
    locked: s.locked,
    interest_rate_delta_bps: s.interest_rate_delta_bps,
    build_cost_multiplier: s.build_cost_multiplier,
    sale_price_multiplier: s.sale_price_multiplier,
    margin_override: s.margin_override,
    timing_shift_months: s.timing_shift_months,
    excluded_project_ids: [...s.excluded_project_ids],
  };
}

export function ScenarioClient({
  projects,
  savedScenarios: initialSaved,
  baseScenario,
  baseKpis,
  baseExtendedKpis,
  savedKpis,
  baseSeries,
  baseAnnual,
  canEdit,
}: Props) {
  const [form, setForm] = useState<FormState>(initialFromBase(baseScenario));
  const [saved, setSaved] = useState<ScenarioView[]>(initialSaved);
  const [activeKpis, setActiveKpis] = useState<KpiBag>(baseKpis);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'apply' | 'save' | 'dup' | 'delete' | 'lock' | null>(null);
  const [, startTransition] = useTransition();

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((s) => ({ ...s, [key]: value }));
  };

  const apply = async () => {
    setBusy('apply');
    setError(null);
    try {
      const res = await fetch('/api/scenarios/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          class: form.class,
          interest_rate_delta_bps: form.interest_rate_delta_bps,
          build_cost_multiplier: form.build_cost_multiplier,
          sale_price_multiplier: form.sale_price_multiplier,
          margin_override: form.margin_override,
          timing_shift_months: form.timing_shift_months,
          excluded_project_ids: form.excluded_project_ids,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? `${res.status} ${res.statusText}`);
      }
      const body = (await res.json()) as { kpis: KpiBag };
      setActiveKpis(body.kpis);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!canEdit) {
      setError('Only editor and super-admin can save scenarios.');
      return;
    }
    setBusy('save');
    setError(null);
    try {
      const payload = {
        name: form.name,
        class: form.class,
        locked: form.locked,
        interest_rate_delta_bps: form.interest_rate_delta_bps,
        build_cost_multiplier: form.build_cost_multiplier,
        sale_price_multiplier: form.sale_price_multiplier,
        margin_override: form.margin_override,
        timing_shift_months: form.timing_shift_months,
        excluded_project_ids: form.excluded_project_ids,
      };

      let body: { scenario: ScenarioView };
      if (form.loadedId) {
        const res = await fetch(`/api/scenarios/${form.loadedId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const e = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(e?.error?.message ?? `${res.status} ${res.statusText}`);
        }
        body = (await res.json()) as { scenario: ScenarioView };
      } else {
        const res = await fetch('/api/scenarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const e = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(e?.error?.message ?? `${res.status} ${res.statusText}`);
        }
        body = (await res.json()) as { scenario: ScenarioView };
      }

      setForm(fromSaved(body.scenario));
      setSaved((cur) => {
        const filtered = cur.filter((s) => s.id !== body.scenario.id);
        return [body.scenario, ...filtered];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const duplicate = async () => {
    if (!canEdit) {
      setError('Only editor and super-admin can save scenarios.');
      return;
    }
    setBusy('dup');
    setError(null);
    try {
      const res = await fetch('/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${form.name} (copy)`,
          class: form.class,
          locked: false,
          interest_rate_delta_bps: form.interest_rate_delta_bps,
          build_cost_multiplier: form.build_cost_multiplier,
          sale_price_multiplier: form.sale_price_multiplier,
          margin_override: form.margin_override,
          timing_shift_months: form.timing_shift_months,
          excluded_project_ids: form.excluded_project_ids,
        }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(e?.error?.message ?? `${res.status} ${res.statusText}`);
      }
      const body = (await res.json()) as { scenario: ScenarioView };
      setForm(fromSaved(body.scenario));
      setSaved((cur) => [body.scenario, ...cur]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const resetToBase = () => {
    setForm(initialFromBase(baseScenario));
    setActiveKpis(baseKpis);
    setError(null);
  };

  const loadSaved = (s: ScenarioView) => {
    setForm(fromSaved(s));
    setError(null);
    // Trigger an apply to refresh KPIs against the freshly-loaded values.
    startTransition(() => void apply());
  };

  const removeSaved = async (s: ScenarioView) => {
    if (!canEdit) return;
    if (s.locked) {
      setError('Scenario is locked. Unlock it first to delete.');
      return;
    }
    setBusy('delete');
    setError(null);
    try {
      const res = await fetch(`/api/scenarios/${s.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(e?.error?.message ?? `${res.status} ${res.statusText}`);
      }
      setSaved((cur) => cur.filter((x) => x.id !== s.id));
      if (form.loadedId === s.id) resetToBase();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const toggleExclusion = (id: string) => {
    setForm((s) => {
      const set = new Set(s.excluded_project_ids);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...s, excluded_project_ids: Array.from(set) };
    });
  };

  // Effect-on-KPIs comparison.
  const comparison = useMemo(() => {
    const out: Array<{
      key: keyof KpiBag;
      label: string;
      base: number;
      active: number;
      delta: number;
    }> = [];
    (Object.keys(KPI_LABELS) as Array<keyof KpiBag>).forEach((key) => {
      const base = baseKpis[key];
      const active = activeKpis[key];
      out.push({ key, label: KPI_LABELS[key], base, active, delta: active - base });
    });
    return out;
  }, [activeKpis, baseKpis]);

  // Variance drivers — which knobs differ from base.
  const varianceDrivers = useMemo(() => {
    const out: Array<{ key: string; label: string; change: string; why: string }> = [];
    if (form.interest_rate_delta_bps !== 0) {
      out.push({
        key: 'rate',
        label: 'Interest rate',
        change: `${form.interest_rate_delta_bps > 0 ? '+' : ''}${form.interest_rate_delta_bps} bps`,
        why: 'Direct hit to financing cost across every project',
      });
    }
    if (form.build_cost_multiplier !== 1) {
      out.push({
        key: 'build',
        label: 'Build cost',
        change: `×${form.build_cost_multiplier.toFixed(3)}`,
        why: 'Scales every construction line on every project',
      });
    }
    if (form.sale_price_multiplier !== 1) {
      out.push({
        key: 'sale',
        label: 'Sale price',
        change: `×${form.sale_price_multiplier.toFixed(3)}`,
        why: 'Top-line revenue — biggest single profit lever',
      });
    }
    if (form.margin_override !== null) {
      out.push({
        key: 'margin',
        label: 'Margin override',
        change: `${(form.margin_override * 100).toFixed(1)}%`,
        why: 'Forces target margin per project, bypassing engine derivation',
      });
    }
    if (form.timing_shift_months !== 0) {
      out.push({
        key: 'timing',
        label: 'Timing shift',
        change: `${form.timing_shift_months > 0 ? '+' : ''}${form.timing_shift_months} months`,
        why: 'Shifts every project schedule, changing the equity-call timeline',
      });
    }
    if (form.excluded_project_ids.length > 0) {
      out.push({
        key: 'exclusions',
        label: 'Project exclusions',
        change: `${form.excluded_project_ids.length} project${form.excluded_project_ids.length === 1 ? '' : 's'}`,
        why: 'Excludes specific projects from the model run',
      });
    }
    return out;
  }, [form]);

  const isBaseCase = varianceDrivers.length === 0 && form.loadedId === null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}
          >
            Scenarios
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            What-if analysis on the portfolio model. Tweak the inputs, hit Apply to see KPIs, Save
            to keep.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <SecondaryButton onClick={duplicate} disabled={!canEdit || busy === 'dup'}>
            Duplicate scenario
          </SecondaryButton>
          <PrimaryButton onClick={save} disabled={!canEdit || busy === 'save'}>
            {form.loadedId ? 'Save changes' : 'Save as new'}
          </PrimaryButton>
          <SecondaryButton onClick={resetToBase} disabled={busy != null}>
            Reset to base
          </SecondaryButton>
        </div>
      </header>

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

      {/* KPI strip */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        <KpiTile
          label="Active"
          value={form.name || 'Base case'}
          hint={isBaseCase ? 'unchanged' : 'modified'}
        />
        <KpiTile
          label="Class"
          value={CLASS_OPTIONS.find((c) => c.value === form.class)?.label ?? form.class}
        />
        <KpiTile
          label="Saved"
          value={String(saved.length)}
          hint={`${saved.filter((s) => s.locked).length} locked`}
        />
        <KpiTile
          label="Excluded"
          value={String(form.excluded_project_ids.length)}
          hint={`of ${projects.length} total`}
        />
      </section>

      {/* Active scenario form */}
      <Section
        title="Active scenario — inputs"
        subtitle={
          form.locked
            ? '🔒 Locked — unlock first to edit other fields'
            : 'Apply to preview KPIs without saving'
        }
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          <Field label="Scenario name">
            <input
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              disabled={form.locked}
              style={inputStyle}
            />
          </Field>
          <Field label="Classification">
            <select
              value={form.class}
              onChange={(e) => update('class', e.target.value as ScenarioClass)}
              disabled={form.locked}
              style={inputStyle}
            >
              {CLASS_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Interest rate Δ (bps)">
            <input
              type="number"
              step={25}
              value={form.interest_rate_delta_bps}
              onChange={(e) => update('interest_rate_delta_bps', Number(e.target.value))}
              disabled={form.locked}
              style={inputStyle}
            />
          </Field>
          <Field label="Build cost ×">
            <input
              type="number"
              step={0.05}
              value={form.build_cost_multiplier}
              onChange={(e) => update('build_cost_multiplier', Number(e.target.value))}
              disabled={form.locked}
              style={inputStyle}
            />
          </Field>
          <Field label="Sale price ×">
            <input
              type="number"
              step={0.05}
              value={form.sale_price_multiplier}
              onChange={(e) => update('sale_price_multiplier', Number(e.target.value))}
              disabled={form.locked}
              style={inputStyle}
            />
          </Field>
          <Field label="Margin override (blank = per-project)">
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={form.margin_override ?? ''}
              onChange={(e) =>
                update('margin_override', e.target.value === '' ? null : Number(e.target.value))
              }
              disabled={form.locked}
              style={inputStyle}
              placeholder="e.g. 0.25"
            />
          </Field>
          <Field label="Timing shift (months)">
            <input
              type="number"
              step={1}
              value={form.timing_shift_months}
              onChange={(e) => update('timing_shift_months', Number(e.target.value))}
              disabled={form.locked}
              style={inputStyle}
            />
          </Field>
          <Field label="Locked as decision">
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: 'var(--color-text-primary)',
              }}
            >
              <input
                type="checkbox"
                checked={form.locked}
                onChange={(e) => update('locked', e.target.checked)}
                disabled={!canEdit}
              />
              Freeze as canonical decision
            </label>
          </Field>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <PrimaryButton onClick={apply} disabled={busy === 'apply'}>
            Apply
          </PrimaryButton>
          <SecondaryButton
            onClick={() => {
              setForm((s) => ({ ...s, ...STRESS_PRESET }));
            }}
            disabled={form.locked}
          >
            Stress preset
          </SecondaryButton>
          <SecondaryButton
            onClick={() => {
              setForm((s) => ({ ...s, ...OPTIMISTIC_PRESET }));
            }}
            disabled={form.locked}
          >
            Optimistic preset
          </SecondaryButton>
        </div>
      </Section>

      {/* Project exclusions */}
      <Section
        title="Project exclusions"
        subtitle={`${form.excluded_project_ids.length} / ${projects.length} excluded from this run`}
      >
        {projects.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
            No projects in the model yet.
          </p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 8,
            }}
          >
            {projects.map((p) => {
              const excluded = form.excluded_project_ids.includes(p.id);
              return (
                <label
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    border: '1px solid var(--color-border-hairline)',
                    borderRadius: 8,
                    background: excluded
                      ? 'var(--color-surface-sunken, #f7f7f7)'
                      : 'var(--color-surface-base)',
                    cursor: form.locked ? 'not-allowed' : 'pointer',
                    fontSize: 13,
                    opacity: form.locked ? 0.6 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!excluded}
                    onChange={() => toggleExclusion(p.id)}
                    disabled={form.locked}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        color: 'var(--color-text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.name}
                    </div>
                    {p.startDate && (
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                        {p.startDate}
                      </div>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </Section>

      {/* Effect on KPIs */}
      <Section
        title="Effect on KPIs"
        subtitle="Comparison vs base case — hit Apply above to refresh"
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
              <th style={th()}>KPI</th>
              <th style={th('right')}>Base case</th>
              <th style={th('right')}>{form.name || 'Active'}</th>
              <th style={th('right')}>Δ</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map((c) => (
              <tr key={c.key} style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
                <td style={td()}>{c.label}</td>
                <td style={td('right')}>{formatKpi(c.key, c.base)}</td>
                <td style={td('right')}>{formatKpi(c.key, c.active)}</td>
                <td
                  style={{
                    ...td('right'),
                    color:
                      c.delta === 0
                        ? 'var(--color-text-tertiary)'
                        : (isProfitFavoring(c.key) ? c.delta > 0 : c.delta < 0)
                          ? 'var(--color-positive, #15803d)'
                          : 'var(--color-negative, #dc2626)',
                  }}
                >
                  {c.delta === 0 ? '—' : `${c.delta > 0 ? '+' : ''}${formatKpi(c.key, c.delta)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Variance drivers */}
      {varianceDrivers.length > 0 && (
        <Section
          title="Variance drivers"
          subtitle="Which knobs differ from the base case in this scenario"
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
                <th style={th()}>Driver</th>
                <th style={th()}>Change</th>
                <th style={th()}>Why it matters</th>
              </tr>
            </thead>
            <tbody>
              {varianceDrivers.map((d) => (
                <tr key={d.key} style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
                  <td style={td()}>{d.label}</td>
                  <td style={td()}>
                    <code style={chip()}>{d.change}</code>
                  </td>
                  <td style={{ ...td(), color: 'var(--color-text-secondary)' }}>{d.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Saved scenarios */}
      {saved.length > 0 && (
        <Section
          title="Saved scenarios"
          subtitle="Click a row to load. Locked rows freeze for board / capital-call reference."
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
                  <th style={th()}>Name</th>
                  <th style={th()}>Class</th>
                  <th style={th('right')}>Rate Δ</th>
                  <th style={th('right')}>Build ×</th>
                  <th style={th('right')}>Sale ×</th>
                  <th style={th('right')}>Timing</th>
                  <th style={th('right')}>Locked</th>
                  <th style={th('right')}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {saved.map((s) => {
                  const isLoaded = form.loadedId === s.id;
                  return (
                    <tr
                      key={s.id}
                      style={{
                        borderBottom: '1px solid var(--color-border-hairline)',
                        background: isLoaded ? 'var(--color-surface-sunken, #f7f7f7)' : undefined,
                      }}
                    >
                      <td style={td()}>
                        <button
                          type="button"
                          onClick={() => loadSaved(s)}
                          style={{
                            all: 'unset',
                            cursor: 'pointer',
                            color: 'var(--color-text-primary)',
                            fontWeight: isLoaded ? 600 : 400,
                          }}
                        >
                          {s.name}
                        </button>
                      </td>
                      <td style={td()}>
                        <span style={chip()}>
                          {CLASS_OPTIONS.find((c) => c.value === s.class)?.label ?? s.class}
                        </span>
                      </td>
                      <td style={td('right')}>
                        {s.interest_rate_delta_bps > 0 ? '+' : ''}
                        {s.interest_rate_delta_bps} bps
                      </td>
                      <td style={td('right')}>×{s.build_cost_multiplier.toFixed(2)}</td>
                      <td style={td('right')}>×{s.sale_price_multiplier.toFixed(2)}</td>
                      <td style={td('right')}>
                        {s.timing_shift_months > 0 ? '+' : ''}
                        {s.timing_shift_months} mo
                      </td>
                      <td style={td('right')}>{s.locked ? '🔒' : '—'}</td>
                      <td style={td('right')}>
                        <button
                          type="button"
                          onClick={() => removeSaved(s)}
                          disabled={!canEdit || s.locked || busy === 'delete'}
                          title={s.locked ? 'Unlock first to delete' : 'Delete scenario'}
                          style={{
                            padding: '3px 10px',
                            fontSize: 12,
                            border: '1px solid var(--color-border-hairline)',
                            background: 'var(--color-surface-base)',
                            borderRadius: 6,
                            cursor: canEdit && !s.locked ? 'pointer' : 'not-allowed',
                            color: 'var(--color-text-secondary)',
                            opacity: !canEdit || s.locked ? 0.5 : 1,
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* V4.5c — Equity + cashflow overlay charts. Sit just above the
          comparison table so the reader's eye flows: shape (chart) →
          endpoints (table). Conditional on saved scenarios + payload
          presence so the page still renders cleanly on a fresh org. */}
      {savedKpis && savedKpis.length > 0 && baseSeries && savedKpis.every((s) => s.series) && (
        <>
          <Section
            title="Equity overlay"
            subtitle="Cumulative equity drawn — base (dashed) vs every saved scenario. Shape matters more than endpoint: steeper curves = faster equity calls."
          >
            <ScenarioOverlayChart
              dates={baseSeries.dates}
              baseValues={baseSeries.cumEquityDrawn}
              scenarios={savedKpis.map((s) => ({
                id: s.id,
                name: s.name,
                values: s.series!.cumEquityDrawn,
              }))}
              valueKind="cumulative"
            />
          </Section>
          <Section
            title="Cash flow overlay"
            subtitle="Monthly net cash — base (dashed) vs every saved scenario. Months below 0 are equity-call months; above 0 are distribution months."
          >
            <ScenarioOverlayChart
              dates={baseSeries.dates}
              baseValues={baseSeries.netCash}
              scenarios={savedKpis.map((s) => ({
                id: s.id,
                name: s.name,
                values: s.series!.netCash,
              }))}
              valueKind="monthly"
            />
          </Section>
        </>
      )}

      {/* V4.5b — Cross-scenario comparison (metric rows × scenario columns) */}
      {savedKpis && savedKpis.length > 0 && (
        <Section
          title="Cross-scenario comparison"
          subtitle="Base + every saved scenario, side by side. Click a column header to load that scenario."
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
                  <th style={th()}>Metric</th>
                  <th style={th('right')}>Base case</th>
                  {savedKpis.map((s) => (
                    <th key={s.id} style={th('right')}>
                      <button
                        type="button"
                        onClick={() => {
                          const full = saved.find((x) => x.id === s.id);
                          if (full) loadSaved(full);
                        }}
                        style={{
                          all: 'unset',
                          cursor: 'pointer',
                          textTransform: 'uppercase',
                          fontSize: 11,
                          fontWeight: form.loadedId === s.id ? 700 : 600,
                          letterSpacing: '0.04em',
                          color:
                            form.loadedId === s.id
                              ? 'var(--color-text-primary)'
                              : 'var(--color-text-tertiary)',
                        }}
                        title={`Load "${s.name}" into the editor`}
                      >
                        {s.name}
                        {s.locked && ' 🔒'}
                      </button>
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 10,
                          fontWeight: 400,
                          color: 'var(--color-text-tertiary)',
                        }}
                      >
                        {CLASS_OPTIONS.find((c) => c.value === s.class)?.label ?? s.class}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <ComparisonRow
                  label="Total profit (pre-tax)"
                  baseVal={baseKpis.total_profit_before_tax}
                  kind="usd"
                  cells={savedKpis.map((s) => s.kpis.total_profit_before_tax)}
                />
                <ComparisonRow
                  label="Total sales"
                  baseVal={baseKpis.total_sales}
                  kind="usd"
                  cells={savedKpis.map((s) => s.kpis.total_sales)}
                />
                <ComparisonRow
                  label="Peak equity"
                  baseVal={baseKpis.peak_equity_required}
                  kind="usd-cost"
                  cells={savedKpis.map((s) => s.kpis.peak_equity_required)}
                />
                <ComparisonRow
                  label="Max debt"
                  baseVal={baseKpis.max_debt_outstanding}
                  kind="usd-cost"
                  cells={savedKpis.map((s) => s.kpis.max_debt_outstanding)}
                />
                <ComparisonRow
                  label="Total interest"
                  baseVal={baseKpis.total_interest}
                  kind="usd-cost"
                  cells={savedKpis.map((s) => s.kpis.total_interest)}
                />
                <ComparisonRow
                  label="Gross MOIC"
                  baseVal={baseKpis.moic_gross}
                  kind="moic"
                  cells={savedKpis.map((s) => s.kpis.moic_gross)}
                />
                {baseExtendedKpis && (
                  <>
                    <ComparisonRow
                      label="Portfolio IRR"
                      baseVal={baseExtendedKpis.irr_annual}
                      kind="pct"
                      cells={savedKpis.map((s) => s.kpis.irr_annual)}
                    />
                    <ComparisonRow
                      label="Payback"
                      baseVal={baseExtendedKpis.payback_months}
                      kind="months"
                      cells={savedKpis.map((s) => s.kpis.payback_months)}
                    />
                  </>
                )}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* V4.5d — Annual P&L by scenario */}
      {savedKpis && savedKpis.length > 0 && baseAnnual && savedKpis.every((s) => s.annual) && (
        <Section
          title="Annual P&L by scenario"
          subtitle="Sales and profit-before-tax per fiscal year, base + every saved scenario. Useful for spotting which year a scenario hits hardest."
        >
          <AnnualPlTable
            baseAnnual={baseAnnual}
            scenarios={savedKpis.map((s) => ({ id: s.id, name: s.name, annual: s.annual! }))}
          />
        </Section>
      )}
    </div>
  );
}

/** V4.5d — Annual P&L table. Two metric blocks (Sales + PBT) stacked
 *  vertically, FYs as rows, scenarios as columns. FY ordering is the
 *  union of every scenario's FYs, sorted ascending. */
function AnnualPlTable({
  baseAnnual,
  scenarios,
}: {
  baseAnnual: Record<string, { sales: number; profit_before_tax: number }>;
  scenarios: Array<{
    id: string;
    name: string;
    annual: Record<string, { sales: number; profit_before_tax: number }>;
  }>;
}) {
  // Build the FY union — different scenarios may have different fiscal
  // years if timing_shift_months pushes them across boundaries.
  const allFys = new Set<string>(Object.keys(baseAnnual));
  for (const s of scenarios) {
    for (const fy of Object.keys(s.annual)) allFys.add(fy);
  }
  const fys = Array.from(allFys).sort();

  if (fys.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
        No fiscal years in the model horizon yet.
      </p>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
            <th style={th()}>Metric</th>
            <th style={th()}>FY</th>
            <th style={th('right')}>Base case</th>
            {scenarios.map((s) => (
              <th key={s.id} style={th('right')}>
                {s.name}
              </th>
            ))}
            <th style={th('right')}>Δ vs base (avg)</th>
          </tr>
        </thead>
        <tbody>
          {/* Sales block */}
          {fys.map((fy, i) => (
            <AnnualRow
              key={`sales-${fy}`}
              metricLabel={i === 0 ? 'Sales' : ''}
              fy={fy}
              baseVal={baseAnnual[fy]?.sales ?? 0}
              cells={scenarios.map((s) => s.annual[fy]?.sales ?? 0)}
              firstInGroup={i === 0}
            />
          ))}
          {/* Spacer */}
          <tr aria-hidden="true">
            <td colSpan={3 + scenarios.length + 1} style={{ height: 8 }} />
          </tr>
          {/* PBT block */}
          {fys.map((fy, i) => (
            <AnnualRow
              key={`pbt-${fy}`}
              metricLabel={i === 0 ? 'Profit (pre-tax)' : ''}
              fy={fy}
              baseVal={baseAnnual[fy]?.profit_before_tax ?? 0}
              cells={scenarios.map((s) => s.annual[fy]?.profit_before_tax ?? 0)}
              firstInGroup={i === 0}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnnualRow({
  metricLabel,
  fy,
  baseVal,
  cells,
  firstInGroup,
}: {
  metricLabel: string;
  fy: string;
  baseVal: number;
  cells: number[];
  firstInGroup: boolean;
}) {
  // Average Δ across saved scenarios (informational summary col).
  const avgDelta =
    cells.length > 0 ? cells.reduce((a, b) => a + (b - baseVal), 0) / cells.length : 0;
  return (
    <tr
      style={{
        borderTop: firstInGroup
          ? '2px solid var(--color-border-strong)'
          : '1px solid var(--color-border-hairline)',
      }}
    >
      <td
        style={{
          ...comparisonTd(),
          fontWeight: firstInGroup ? 600 : 400,
          color: firstInGroup ? 'var(--color-text-primary)' : 'transparent',
        }}
      >
        {metricLabel || '·'}
      </td>
      <td style={{ ...comparisonTd(), color: 'var(--color-text-tertiary)', fontSize: 12 }}>{fy}</td>
      <td style={{ ...comparisonTd('right'), color: 'var(--color-text-secondary)' }}>
        {fmtCell(baseVal, 'usd')}
      </td>
      {cells.map((v, i) => {
        const delta = v - baseVal;
        const color =
          delta === 0
            ? 'var(--color-text-primary)'
            : delta > 0
              ? 'var(--color-positive, #15803d)'
              : 'var(--color-negative, #dc2626)';
        return (
          <td key={i} style={{ ...comparisonTd('right'), color }}>
            {fmtCell(v, 'usd')}
          </td>
        );
      })}
      <td
        style={{
          ...comparisonTd('right'),
          fontWeight: 400,
          color:
            avgDelta === 0
              ? 'var(--color-text-tertiary)'
              : avgDelta > 0
                ? 'var(--color-positive, #15803d)'
                : 'var(--color-negative, #dc2626)',
        }}
      >
        {avgDelta === 0 ? '—' : `${avgDelta > 0 ? '+' : ''}${fmtCell(avgDelta, 'usd')}`}
      </td>
    </tr>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

/** Format value per metric kind. Returns "—" for null/undefined. */
function fmtCell(
  value: number | null | undefined,
  kind: 'usd' | 'usd-cost' | 'moic' | 'pct' | 'months'
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (kind === 'moic') return `${value.toFixed(2)}×`;
  if (kind === 'pct') return `${(value * 100).toFixed(1)}%`;
  if (kind === 'months') return `${Math.round(value)} mo`;
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** Whether a positive delta is "good" for this metric. For costs (peak
 *  equity, max debt, interest), down is good. */
function isProfitFavoringMetric(kind: 'usd' | 'usd-cost' | 'moic' | 'pct' | 'months'): boolean {
  return kind === 'usd' || kind === 'moic' || kind === 'pct';
}

function ComparisonRow({
  label,
  baseVal,
  kind,
  cells,
}: {
  label: string;
  baseVal: number | null | undefined;
  kind: 'usd' | 'usd-cost' | 'moic' | 'pct' | 'months';
  cells: Array<number | null | undefined>;
}) {
  const favorPositive = isProfitFavoringMetric(kind);
  return (
    <tr style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
      <td style={comparisonTd()}>{label}</td>
      <td style={{ ...comparisonTd('right'), color: 'var(--color-text-secondary)' }}>
        {fmtCell(baseVal ?? null, kind)}
      </td>
      {cells.map((v, i) => {
        const delta = v != null && baseVal != null ? v - baseVal : null;
        const color =
          delta == null || delta === 0
            ? 'var(--color-text-primary)'
            : (favorPositive ? delta > 0 : delta < 0)
              ? 'var(--color-positive, #15803d)'
              : 'var(--color-negative, #dc2626)';
        return (
          <td key={i} style={{ ...comparisonTd('right'), color }}>
            {fmtCell(v ?? null, kind)}
          </td>
        );
      })}
    </tr>
  );
}

function comparisonTd(align: 'left' | 'right' = 'left'): React.CSSProperties {
  return {
    textAlign: align,
    padding: '10px 8px 10px 0',
    fontVariantNumeric: align === 'right' ? 'tabular-nums' : 'normal',
  };
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 14,
        padding: 20,
      }}
    >
      <header style={{ marginBottom: 12 }}>
        <h2
          style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}
        >
          {title}
        </h2>
        {subtitle && (
          <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {subtitle}
          </p>
        )}
      </header>
      {children}
    </section>
  );
}

function KpiTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-tertiary)',
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          marginTop: 6,
        }}
      >
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--color-text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </label>
      {children}
    </div>
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
        fontWeight: 400,
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
        background: 'var(--color-surface-base)',
        color: 'var(--color-text-primary)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 400,
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

function chip(): React.CSSProperties {
  return {
    background: 'var(--color-surface-sunken, #f7f7f7)',
    padding: '2px 8px',
    borderRadius: 6,
    fontSize: 12,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    color: 'var(--color-text-primary)',
  };
}

function isProfitFavoring(key: keyof KpiBag): boolean {
  return key === 'total_profit_before_tax' || key === 'total_sales' || key === 'moic_gross';
}

function formatKpi(key: keyof KpiBag, value: number): string {
  if (key === 'moic_gross') return `${value.toFixed(2)}×`;
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

function th(align: 'left' | 'right' = 'left'): React.CSSProperties {
  return {
    textAlign: align,
    padding: '8px 0',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)',
  };
}

function td(align: 'left' | 'right' = 'left'): React.CSSProperties {
  return {
    textAlign: align,
    padding: '10px 8px 10px 0',
    fontVariantNumeric: align === 'right' ? 'tabular-nums' : 'normal',
    color: 'var(--color-text-primary)',
  };
}
