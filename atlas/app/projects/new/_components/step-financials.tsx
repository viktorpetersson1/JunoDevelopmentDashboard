'use client';

import { Field } from './field';
import { formatMoney } from '@/lib/utils/money';
import type { CreateProjectInput } from '@/lib/services/project-schema';

export function StepFinancials({
  form,
  update,
  errors,
}: {
  form: CreateProjectInput;
  update: <K extends keyof CreateProjectInput>(key: K, value: CreateProjectInput[K]) => void;
  errors: (k: keyof CreateProjectInput) => string | undefined;
}) {
  const totalSqft = (form.villa_sqft_ag ?? 0) + (form.villa_sqft_bg ?? 0);
  const buildCostPerSqft = form.build_cost_per_sqft ?? 470; // BASELINE_GLOBALS default
  const estimatedBuildCost = (form.villa_sqft_ag ?? 0) * buildCostPerSqft;
  const estimatedAllIn =
    (form.land_cost_usd ?? 0) + estimatedBuildCost + (form.soft_costs_lump_sum ?? 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: 'var(--color-text-tertiary)',
        }}
      >
        Sizing + costs. Anything you leave blank uses BASELINE_GLOBALS — most
        cost-per-sqft + financing fields fill themselves.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field
          label="Above-grade sqft"
          name="villa_sqft_ag"
          kind="integer"
          value={form.villa_sqft_ag}
          onChange={(v) => update('villa_sqft_ag', typeof v === 'number' ? v : 0)}
          error={errors('villa_sqft_ag')}
          required
          min={0}
          suffix="sqft"
          placeholder="e.g. 4500"
        />
        <Field
          label="Below-grade sqft"
          name="villa_sqft_bg"
          kind="integer"
          value={form.villa_sqft_bg}
          onChange={(v) => update('villa_sqft_bg', typeof v === 'number' ? v : 0)}
          error={errors('villa_sqft_bg')}
          min={0}
          suffix="sqft"
          hint="Basement, garage. Defaults to 0."
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field
          label="Land cost"
          name="land_cost_usd"
          kind="number"
          value={form.land_cost_usd}
          onChange={(v) => update('land_cost_usd', typeof v === 'number' ? v : 0)}
          error={errors('land_cost_usd')}
          required
          min={0}
          step={1000}
          suffix="USD"
          placeholder="e.g. 2200000"
        />
        <Field
          label="Build cost per sqft override"
          name="build_cost_per_sqft"
          kind="number"
          value={form.build_cost_per_sqft ?? null}
          onChange={(v) => update('build_cost_per_sqft', typeof v === 'number' ? v : null)}
          error={errors('build_cost_per_sqft')}
          min={0}
          step={10}
          suffix="$/sqft"
          hint="Leave blank to use global default ($470)."
        />
      </div>

      <Field
        label="Soft costs (lump sum)"
        name="soft_costs_lump_sum"
        kind="number"
        value={form.soft_costs_lump_sum}
        onChange={(v) => update('soft_costs_lump_sum', typeof v === 'number' ? v : 0)}
        error={errors('soft_costs_lump_sum')}
        min={0}
        step={1000}
        suffix="USD"
        hint="A&E + permits + insurance + contingency reserve."
      />

      <section
        style={{
          background: 'var(--color-surface-base)',
          border: '1px solid var(--color-border-hairline)',
          borderRadius: 12,
          padding: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          fontSize: 13,
        }}
      >
        <Summary label="Total sqft" value={`${totalSqft.toLocaleString()} sqft`} />
        <Summary
          label="Est. build"
          value={formatMoney(estimatedBuildCost * 100, { compact: true, precision: 2 })}
          hint={`${(form.villa_sqft_ag ?? 0).toLocaleString()} sqft × $${buildCostPerSqft.toLocaleString()}/sqft`}
        />
        <Summary
          label="All-in (rough)"
          value={formatMoney(estimatedAllIn * 100, { compact: true, precision: 2 })}
          hint="land + build + soft (no financing)"
        />
      </section>
    </div>
  );
}

function Summary({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-text-tertiary)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
      {hint && (
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{hint}</span>
      )}
    </div>
  );
}
