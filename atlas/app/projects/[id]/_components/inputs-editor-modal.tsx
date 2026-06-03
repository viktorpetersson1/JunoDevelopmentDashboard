'use client';

/**
 * Inputs editor (V6.1 T104 + T107). One modal, SEVEN sections grouped like
 * the Excel "Assumptions & key figures" block plus a new Cost-breakdown
 * tail: Schedule · Villa · Costs · Financing · Targets · Tax · Cost breakdown.
 * Single Save (PATCH /api/projects/[key]); dirty-check on close.
 *
 * Editor role only — the launcher button is hidden for viewers (the page
 * passes isEditor). The whole thing is a client island embedded in the
 * (server-rendered) Inputs tab.
 *
 * V6.1 DEVIATIONS REGISTERED:
 *   - T104: §3b E6 says reuse a <ConfirmDialog> primitive for the dirty-check
 *     — none exists. Composed from the existing <Modal> primitive
 *     (Hard Rule #3: compose from ja-* primitives).
 *   - T107 (V6-05.a): the plan calls Cost breakdown a "new TAB" on the
 *     Inputs editor modal. The existing modal uses stacked <Section title>
 *     blocks rather than tabs — refactoring to tabs is out of scope.
 *     Cost breakdown ships as a 7th <Section>; matches the existing pattern.
 *
 * EXCLUDED fields (V6.1 stop-and-ask): Superstructure $/sqft
 * (kingshaus_cost_per_sqft) and LTC% (ltc_pct) — both live in the ProjectInput
 * type but have NO atlas.projects column to persist to. Surfaced to Viktor;
 * not fabricated here.
 */

import { useMemo, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/app/projects/new/_components/field';
import { StatusDot } from '@/components/feedback/StatusDot';
import type { ProjectInput } from '@/lib/calc/project/types';
import type { CostBreakdown, CostLineItem } from '@/lib/services/project-schema';

type CostGroupKey = 'construction' | 'superstructure' | 'soft' | 'financing';

const COST_GROUPS: Array<{ key: CostGroupKey; label: string }> = [
  { key: 'construction', label: 'Construction' },
  { key: 'superstructure', label: 'Superstructure' },
  { key: 'soft', label: 'Soft' },
  { key: 'financing', label: 'Financing' },
];

const COST_STATUS_OPTIONS: Array<{ value: '' | 'estimate' | 'committed' | 'paid'; label: string }> = [
  { value: '', label: '—' },
  { value: 'estimate', label: 'Estimate' },
  { value: 'committed', label: 'Committed' },
  { value: 'paid', label: 'Paid' },
];

/** Empty-but-typed cost breakdown — every group present so editors can add
 *  lines without an undefined-key dance. */
function emptyCostBreakdown(): CostBreakdown {
  return { construction: [], superstructure: [], soft: [], financing: [] };
}

/** Sum the amount column of a group's line items (zeroes treated as zero). */
function groupTotal(lines: CostLineItem[] | undefined): number {
  if (!lines) return 0;
  let s = 0;
  for (const l of lines) {
    if (Number.isFinite(l.amount_usd)) s += l.amount_usd;
  }
  return s;
}

/** Compact USD formatter: $1.2M / $340k / $1,234. */
function fmtCompactUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** Strip empty rows + drop the breakdown entirely if every group is empty.
 *  Returns null when nothing should be persisted (clears the column). */
function compactCostBreakdown(bd: CostBreakdown | null): CostBreakdown | null {
  if (!bd) return null;
  const out: CostBreakdown = {};
  let anyPresent = false;
  for (const { key } of COST_GROUPS) {
    const lines = (bd[key] ?? []).filter(
      (l) => (l.label?.trim().length ?? 0) > 0 || (Number.isFinite(l.amount_usd) && l.amount_usd !== 0)
    );
    if (lines.length > 0) {
      // Normalise: trim strings, drop empty status/note before send.
      out[key] = lines.map((l) => {
        const norm: CostLineItem = {
          label: (l.label ?? '').trim(),
          amount_usd: Number.isFinite(l.amount_usd) ? l.amount_usd : 0,
        };
        if (l.note && l.note.trim().length > 0) norm.note = l.note.trim();
        if (l.status) norm.status = l.status;
        return norm;
      });
      anyPresent = true;
    }
  }
  return anyPresent ? out : null;
}

type Num = number | null;
type Str = string | null;

interface FormState {
  // Schedule
  purchase_date: Str;
  sourcing_months: Num;
  permitting_preconstruction_months: Num;
  construction_months: Num;
  sales_months: Num;
  // Villa
  villa_sqft_ag: Num;
  villa_sqft_bg: Num;
  // Costs (dollars)
  land_cost_usd: Num;
  build_cost_per_sqft: Num;
  soft_costs_lump_sum: Num;
  // Financing (percent in the UI; converted to decimals on submit)
  lender_name: Str;
  senior_ltv_display_pct: Num;
  interest_rate_display_pct: Num;
  // Targets
  sale_price_override_usd: Num;
  sale_price_per_sqft_override: Num;
  target_margin_display_pct: Num;
  // Tax (already a percent)
  tax_rate_pct: Num;
  // V6.1 T107 — itemised cost breakdown (engine never reads this; pure UI).
  cost_breakdown: CostBreakdown | null;
}

function toForm(p: ProjectInput): FormState {
  const pct = (v: number | null | undefined) => (v == null ? null : Math.round(v * 1000) / 10); // decimal→pct, 1dp
  // Coerce the (structurally compatible) calc-side CostBreakdownShape into
  // the schema-side CostBreakdown the editor stores. Falls back to empty.
  const breakdown: CostBreakdown | null = p.cost_breakdown
    ? (p.cost_breakdown as unknown as CostBreakdown)
    : null;
  return {
    purchase_date: p.purchase_date ?? p.start_date ?? null,
    sourcing_months: p.sourcing_months ?? null,
    permitting_preconstruction_months: p.permitting_preconstruction_months ?? null,
    construction_months: p.construction_months ?? null,
    sales_months: p.sales_months ?? null,
    villa_sqft_ag: p.villa_sqft_ag ?? null,
    villa_sqft_bg: p.villa_sqft_bg ?? null,
    land_cost_usd: p.land_cost_usd ?? null,
    build_cost_per_sqft: p.build_cost_per_sqft ?? null,
    soft_costs_lump_sum: p.soft_costs_lump_sum ?? null,
    lender_name: p.lender_name ?? null,
    senior_ltv_display_pct: pct(p.senior_ltv_pct),
    interest_rate_display_pct: pct(p.interest_rate_apr),
    sale_price_override_usd: p.sale_price_override_usd ?? null,
    sale_price_per_sqft_override: p.sale_price_per_sqft_override ?? null,
    target_margin_display_pct: pct(p.target_margin),
    tax_rate_pct: p.tax_rate_pct ?? 25,
    cost_breakdown: breakdown,
  };
}

/** Build the PATCH body in UpdateProjectSchema units (dollars, decimals 0–1,
 *  % for tax). Percent UI fields are divided by 100. */
function toPayload(f: FormState): Record<string, unknown> {
  const dec = (v: Num) => (v == null ? null : v / 100);
  const body: Record<string, unknown> = {
    sourcing_months: f.sourcing_months,
    permitting_preconstruction_months: f.permitting_preconstruction_months,
    construction_months: f.construction_months,
    sales_months: f.sales_months,
    villa_sqft_ag: f.villa_sqft_ag,
    villa_sqft_bg: f.villa_sqft_bg,
    land_cost_usd: f.land_cost_usd,
    build_cost_per_sqft: f.build_cost_per_sqft, // nullable
    soft_costs_lump_sum: f.soft_costs_lump_sum,
    lender_name: f.lender_name, // nullable
    senior_ltv_pct: dec(f.senior_ltv_display_pct), // required (non-null) server-side
    interest_rate_apr: dec(f.interest_rate_display_pct), // nullable
    sale_price_override_usd: f.sale_price_override_usd, // nullable
    sale_price_per_sqft_override: f.sale_price_per_sqft_override, // nullable
    target_margin: dec(f.target_margin_display_pct), // nullable
    tax_rate_pct: f.tax_rate_pct,
    // V6.1 T107 — strip empty groups + lines; null when fully empty so the
    // PATCH clears the column rather than writing {} (Zod accepts both).
    cost_breakdown: compactCostBreakdown(f.cost_breakdown),
  };
  // purchase_date must match YYYY-MM when present; omit entirely when blank.
  if (f.purchase_date && /^\d{4}-\d{2}$/.test(f.purchase_date)) {
    body.purchase_date = f.purchase_date;
  }
  return body;
}

export function InputsEditor({
  projectKey,
  project,
  isEditor,
}: {
  projectKey: string;
  project: ProjectInput;
  isEditor: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const initial = useMemo(() => toForm(project), [project]);
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  if (!isEditor) return null;

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // ── Cost-breakdown helpers (V6.1 T107) ────────────────────────────────────
  /** Replace one group's array; ensures the breakdown object exists. */
  function setGroup(group: CostGroupKey, lines: CostLineItem[]) {
    setForm((f) => {
      const base = f.cost_breakdown ?? emptyCostBreakdown();
      return { ...f, cost_breakdown: { ...base, [group]: lines } };
    });
  }
  function addLine(group: CostGroupKey) {
    const current = form.cost_breakdown?.[group] ?? [];
    setGroup(group, [...current, { label: '', amount_usd: 0 }]);
  }
  function updateLine(group: CostGroupKey, idx: number, patch: Partial<CostLineItem>) {
    const current = form.cost_breakdown?.[group] ?? [];
    const next = current.map((line, i) => (i === idx ? { ...line, ...patch } : line));
    setGroup(group, next);
  }
  function deleteLine(group: CostGroupKey, idx: number) {
    const current = form.cost_breakdown?.[group] ?? [];
    setGroup(
      group,
      current.filter((_, i) => i !== idx)
    );
  }

  /** Resolve the lump-sum mirror for a group, if any. Returns null when the
   *  group has no Costs-section counterpart (superstructure, financing) or
   *  when the user has not filled the lump-sum field in. */
  function lumpSumMirror(group: CostGroupKey): number | null {
    if (group === 'construction') {
      const psf = form.build_cost_per_sqft;
      const sqft = form.villa_sqft_ag;
      if (psf == null || sqft == null) return null;
      const lump = psf * sqft;
      return lump > 0 ? lump : null;
    }
    if (group === 'soft') {
      return form.soft_costs_lump_sum && form.soft_costs_lump_sum > 0
        ? form.soft_costs_lump_sum
        : null;
    }
    return null;
  }
  function divergencePct(lump: number, breakdownTotal: number): number {
    if (lump === 0) return 0;
    return Math.abs(breakdownTotal - lump) / lump;
  }

  function openModal() {
    setForm(initial);
    setFieldErrors({});
    setBannerError(null);
    setOpen(true);
  }

  function requestClose() {
    if (saving) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    setOpen(false);
  }

  function discard() {
    setConfirmDiscard(false);
    setForm(initial);
    setOpen(false);
  }

  async function save() {
    setSaving(true);
    setFieldErrors({});
    setBannerError(null);
    try {
      const res = await fetch(`/api/projects/${projectKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(form)),
      });
      const json = (await res.json().catch(() => null)) as
        | { data?: unknown; error?: { code?: string; message?: string } }
        | null;

      if (!res.ok) {
        const code = json?.error?.code;
        const message = json?.error?.message ?? `Save failed (HTTP ${res.status})`;
        if (code === 'VALIDATION_FAILED') {
          setFieldErrors(parseValidationMessage(message));
          setBannerError('Some fields need attention.');
        } else {
          // CALC_ENGINE_ERROR (E7) + everything else → verbatim banner.
          setBannerError(message);
        }
        setSaving(false);
        return;
      }

      // Success — re-render the server page so every derived number updates.
      setSaving(false);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setBannerError(e instanceof Error ? e.message : 'Network error');
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={openModal}>
        Edit inputs
      </Button>

      <Modal
        open={open}
        onClose={requestClose}
        title="Edit project inputs"
        description="Grouped like the Excel assumptions block. One save re-runs the model."
        size="xl"
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="ghost" onClick={requestClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>
              Save changes
            </Button>
          </>
        }
      >
        {bannerError && (
          <div
            role="alert"
            style={{
              marginBottom: 16,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--color-negative, #b91c1c)',
              background: 'var(--color-negative-soft, #fef2f2)',
              color: 'var(--color-negative, #b91c1c)',
              fontSize: 13,
            }}
          >
            {bannerError}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Section title="Schedule">
            <Field
              label="Purchase / start month"
              name="purchase_date"
              kind="month"
              value={form.purchase_date}
              onChange={(v) => set('purchase_date', v as Str)}
              error={fieldErrors.purchase_date}
            />
            <Field label="Sourcing" name="sourcing_months" kind="integer" min={0} suffix="mo"
              value={form.sourcing_months} onChange={(v) => set('sourcing_months', v as Num)}
              error={fieldErrors.sourcing_months} />
            <Field label="Permitting / pre-con" name="permitting" kind="integer" min={0} suffix="mo"
              value={form.permitting_preconstruction_months}
              onChange={(v) => set('permitting_preconstruction_months', v as Num)}
              error={fieldErrors.permitting_preconstruction_months} />
            <Field label="Construction" name="construction_months" kind="integer" min={0} suffix="mo"
              value={form.construction_months} onChange={(v) => set('construction_months', v as Num)}
              error={fieldErrors.construction_months} />
            <Field label="Sales" name="sales_months" kind="integer" min={0} suffix="mo"
              value={form.sales_months} onChange={(v) => set('sales_months', v as Num)}
              error={fieldErrors.sales_months} />
          </Section>

          <Section title="Villa">
            <Field label="Sqft above grade" name="villa_sqft_ag" kind="integer" min={1} suffix="sqft"
              required value={form.villa_sqft_ag} onChange={(v) => set('villa_sqft_ag', v as Num)}
              error={fieldErrors.villa_sqft_ag} />
            <Field label="Sqft below grade" name="villa_sqft_bg" kind="integer" min={0} suffix="sqft"
              value={form.villa_sqft_bg} onChange={(v) => set('villa_sqft_bg', v as Num)}
              error={fieldErrors.villa_sqft_bg} />
          </Section>

          <Section title="Costs">
            <Field label="Land cost" name="land_cost_usd" kind="number" min={0} suffix="$" required
              value={form.land_cost_usd} onChange={(v) => set('land_cost_usd', v as Num)}
              error={fieldErrors.land_cost_usd} />
            <Field label="Build $/sqft" name="build_cost_per_sqft" kind="number" min={0} suffix="$/sqft"
              hint="Blank = use global default" value={form.build_cost_per_sqft}
              onChange={(v) => set('build_cost_per_sqft', v as Num)}
              error={fieldErrors.build_cost_per_sqft} />
            <Field label="Soft costs (lump sum)" name="soft_costs_lump_sum" kind="number" min={0} suffix="$"
              value={form.soft_costs_lump_sum} onChange={(v) => set('soft_costs_lump_sum', v as Num)}
              error={fieldErrors.soft_costs_lump_sum} />
          </Section>

          <Section title="Financing">
            <Field label="Lender" name="lender_name" kind="text"
              value={form.lender_name} onChange={(v) => set('lender_name', v as Str)}
              error={fieldErrors.lender_name} />
            <Field label="Senior LTV" name="senior_ltv_pct" kind="number" min={0} max={100} suffix="%" required
              value={form.senior_ltv_display_pct} onChange={(v) => set('senior_ltv_display_pct', v as Num)}
              error={fieldErrors.senior_ltv_pct} />
            <Field label="Interest rate (APR)" name="interest_rate_apr" kind="number" min={0} max={100} suffix="%"
              hint="Blank = use global rate" value={form.interest_rate_display_pct}
              onChange={(v) => set('interest_rate_display_pct', v as Num)}
              error={fieldErrors.interest_rate_apr} />
          </Section>

          <Section title="Targets">
            <Field label="Sale price override" name="sale_price_override_usd" kind="number" min={0} suffix="$"
              value={form.sale_price_override_usd}
              onChange={(v) => set('sale_price_override_usd', v as Num)}
              error={fieldErrors.sale_price_override_usd} />
            <Field label="$/sqft override" name="sale_price_per_sqft_override" kind="number" min={0} suffix="$/sqft"
              value={form.sale_price_per_sqft_override}
              onChange={(v) => set('sale_price_per_sqft_override', v as Num)}
              error={fieldErrors.sale_price_per_sqft_override} />
            <Field label="Target margin" name="target_margin" kind="number" min={0} max={100} suffix="%"
              value={form.target_margin_display_pct}
              onChange={(v) => set('target_margin_display_pct', v as Num)}
              error={fieldErrors.target_margin} />
          </Section>

          <Section title="Tax">
            <Field label="Effective tax rate" name="tax_rate_pct" kind="number" min={0} max={100} suffix="%" required
              hint="Presentation-only (9-line P&L); engine global tax unchanged"
              value={form.tax_rate_pct} onChange={(v) => set('tax_rate_pct', v as Num)}
              error={fieldErrors.tax_rate_pct} />
          </Section>

          {/*
            V6.1 T107 — Cost breakdown (deviation V6-05.a: rendered as a 7th
            Section rather than a separate tab; matches the existing stacked
            <Section> pattern). Engine NEVER reads this column (Hard Rule #2).
          */}
          <Section title="Cost breakdown" fullWidth>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                Optional itemised costs. Engine reads only the lump-sum fields above;
                this is for board reporting and the Summary tab.
              </div>
              {COST_GROUPS.map(({ key, label }) => {
                const lines = form.cost_breakdown?.[key] ?? [];
                const total = groupTotal(lines);
                const lump = lumpSumMirror(key);
                const diverges =
                  lump != null && total > 0 && divergencePct(lump, total) > 0.05;
                return (
                  <details
                    key={key}
                    open={lines.length > 0}
                    style={{
                      border: '1px solid var(--color-border-hairline)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      background: 'var(--color-surface-base)',
                    }}
                  >
                    <summary
                      style={{
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      <span>{label}</span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: 'var(--color-text-tertiary)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {fmtCompactUsd(total)} ({lines.length} {lines.length === 1 ? 'line' : 'lines'})
                      </span>
                      {diverges && lump != null && (
                        <StatusDot
                          severity="warning"
                          title="Cost mismatch"
                          message={`Lump-sum ${fmtCompactUsd(lump)} and breakdown ${fmtCompactUsd(total)} diverge by ${(divergencePct(lump, total) * 100).toFixed(0)}%.`}
                        />
                      )}
                    </summary>
                    <CostGroupTable
                      group={key}
                      lines={lines}
                      onAdd={() => addLine(key)}
                      onUpdate={(idx, patch) => updateLine(key, idx, patch)}
                      onDelete={(idx) => deleteLine(key, idx)}
                      errors={fieldErrors}
                    />
                  </details>
                );
              })}
            </div>
          </Section>
        </div>
      </Modal>

      {/* Dirty-check confirm — composed from the Modal primitive (no ConfirmDialog exists). */}
      <Modal
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title="Discard unsaved changes?"
        description="Your edits to this project's inputs will be lost."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>
              Keep editing
            </Button>
            <Button variant="danger" onClick={discard}>
              Discard
            </Button>
          </>
        }
      />
    </>
  );
}

function Section({
  title,
  children,
  fullWidth,
}: {
  title: string;
  children: React.ReactNode;
  /** When true, render the body as a single column instead of the default
   *  2-column grid — used by Cost breakdown so the per-group <details>
   *  blocks span the full modal width. */
  fullWidth?: boolean;
}) {
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
      <div
        style={
          fullWidth
            ? { display: 'block' }
            : { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }
        }
      >
        {children}
      </div>
    </section>
  );
}

/**
 * V6.1 T107 — per-group line-item table. Inline label / amount / status / note
 * inputs + per-row delete + "Add line" button. Composed from native HTML
 * primitives (Hard Rule #3) — no new UI library.
 */
function CostGroupTable({
  group,
  lines,
  onAdd,
  onUpdate,
  onDelete,
  errors,
}: {
  group: CostGroupKey;
  lines: CostLineItem[];
  onAdd: () => void;
  onUpdate: (idx: number, patch: Partial<CostLineItem>) => void;
  onDelete: (idx: number) => void;
  errors: Record<string, string>;
}) {
  function cellInputStyle(error: boolean): React.CSSProperties {
    return {
      width: '100%',
      padding: '6px 8px',
      fontSize: 13,
      border: `1px solid ${error ? 'var(--color-negative, #dc2626)' : 'var(--color-border-hairline)'}`,
      borderRadius: 6,
      background: 'var(--color-surface-base)',
      color: 'var(--color-text-primary)',
      boxSizing: 'border-box',
      fontVariantNumeric: 'tabular-nums',
    };
  }

  return (
    <div style={{ marginTop: 10 }}>
      {lines.length === 0 ? (
        <div
          style={{
            fontSize: 12,
            color: 'var(--color-text-tertiary)',
            padding: '8px 0',
            fontStyle: 'italic',
          }}
        >
          No line items yet.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(140px, 1.8fr) 120px 110px minmax(120px, 1.4fr) 32px',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <div style={headerCellStyle}>Label</div>
          <div style={headerCellStyle}>Amount ($)</div>
          <div style={headerCellStyle}>Status</div>
          <div style={headerCellStyle}>Note</div>
          <div />
          {lines.map((line, idx) => {
            const labelKey = `cost_breakdown.${group}.${idx}.label`;
            const amountKey = `cost_breakdown.${group}.${idx}.amount_usd`;
            return (
              <CostLineRow
                key={`${group}-${idx}`}
                line={line}
                labelError={errors[labelKey]}
                amountError={errors[amountKey]}
                onChange={(patch) => onUpdate(idx, patch)}
                onDelete={() => onDelete(idx)}
                cellInputStyle={cellInputStyle}
              />
            );
          })}
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          onClick={onAdd}
          style={{
            fontSize: 12,
            background: 'none',
            border: '1px dashed var(--color-border-hairline)',
            borderRadius: 6,
            padding: '6px 12px',
            cursor: 'pointer',
            color: 'var(--color-text-primary)',
          }}
        >
          + Add line
        </button>
      </div>
    </div>
  );
}

const headerCellStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--color-text-tertiary)',
  fontWeight: 600,
};

function CostLineRow({
  line,
  labelError,
  amountError,
  onChange,
  onDelete,
  cellInputStyle,
}: {
  line: CostLineItem;
  labelError?: string;
  amountError?: string;
  onChange: (patch: Partial<CostLineItem>) => void;
  onDelete: () => void;
  cellInputStyle: (error: boolean) => React.CSSProperties;
}) {
  function handleAmount(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (raw === '') {
      onChange({ amount_usd: 0 });
      return;
    }
    const n = Number.parseFloat(raw);
    onChange({ amount_usd: Number.isFinite(n) ? n : 0 });
  }
  function handleStatus(e: ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value as '' | 'estimate' | 'committed' | 'paid';
    if (v === '') {
      // Drop the status by passing undefined; the row state replaces the line
      // so we send the change as-is — parent merges via {...line, ...patch}.
      onChange({ status: undefined });
      return;
    }
    onChange({ status: v });
  }
  return (
    <>
      <input
        type="text"
        value={line.label}
        onChange={(e) => onChange({ label: e.target.value })}
        placeholder="e.g. Excavation"
        style={cellInputStyle(!!labelError)}
        aria-label="Cost line label"
      />
      <input
        type="number"
        value={Number.isFinite(line.amount_usd) ? line.amount_usd : 0}
        onChange={handleAmount}
        step={1000}
        style={cellInputStyle(!!amountError)}
        aria-label="Cost line amount"
      />
      <select
        value={line.status ?? ''}
        onChange={handleStatus}
        style={cellInputStyle(false)}
        aria-label="Cost line status"
      >
        {COST_STATUS_OPTIONS.map((o) => (
          <option key={o.value || 'blank'} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={line.note ?? ''}
        onChange={(e) => onChange({ note: e.target.value })}
        placeholder="Optional"
        style={cellInputStyle(false)}
        aria-label="Cost line note"
      />
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete cost line"
        title="Delete line"
        style={{
          background: 'none',
          border: '1px solid var(--color-border-hairline)',
          borderRadius: 6,
          width: 28,
          height: 28,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'var(--color-text-tertiary)',
          fontSize: 14,
          lineHeight: 1,
        }}
      >
        x
      </button>
    </>
  );
}

/** Parse the API's concatenated "path — message; path2 — message2" string into
 *  a per-field map. Maps the percent-display fields back to their UI keys. */
function parseValidationMessage(message: string): Record<string, string> {
  const out: Record<string, string> = {};
  const body = message.replace(/^Validation failed:\s*/, '');
  for (const part of body.split('; ')) {
    const [path, ...rest] = part.split(' — ');
    if (!path || rest.length === 0) continue;
    out[path.trim()] = rest.join(' — ').trim();
  }
  return out;
}
