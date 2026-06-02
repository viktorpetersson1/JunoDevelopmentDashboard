'use client';

/**
 * Inputs editor (V6.1 T104). One modal, six sections grouped like the Excel
 * "Assumptions & key figures" block: Schedule · Villa · Costs · Financing ·
 * Targets · Tax. Single Save (PATCH /api/projects/[key]); dirty-check on close.
 *
 * Editor role only — the launcher button is hidden for viewers (the page
 * passes isEditor). The whole thing is a client island embedded in the
 * (server-rendered) Inputs tab.
 *
 * NOTE (V6.1 deviation): §3b E6 says reuse a <ConfirmDialog> primitive for the
 * dirty-check — none exists in the repo. We compose the confirm from the
 * existing <Modal> primitive (Hard Rule #3: compose from ja-* primitives).
 *
 * EXCLUDED fields (V6.1 stop-and-ask): Superstructure $/sqft
 * (kingshaus_cost_per_sqft) and LTC% (ltc_pct) — both live in the ProjectInput
 * type but have NO atlas.projects column to persist to. Surfaced to Viktor;
 * not fabricated here.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/app/projects/new/_components/field';
import type { ProjectInput } from '@/lib/calc/project/types';

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
}

function toForm(p: ProjectInput): FormState {
  const pct = (v: number | null | undefined) => (v == null ? null : Math.round(v * 1000) / 10); // decimal→pct, 1dp
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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
