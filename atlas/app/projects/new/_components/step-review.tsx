'use client';

/**
 * Review step — runs the calc engine over the in-progress form data so the
 * user sees the KPIs they're about to commit to.
 *
 * Re-uses the same runProject pipeline the rest of the platform uses. Any
 * Zod-required fields not yet filled make runProject's preview meaningless,
 * so we guard with a "fill earlier steps first" placeholder.
 */

import { useMemo } from 'react';
import { runProject } from '@/lib/calc/project/runProject';
import { BASELINE_GLOBALS, BASELINE_SCENARIO } from '@/lib/calc/baselines';
import { formatMoney } from '@/lib/utils/money';
import { CreateProjectSchema, type CreateProjectInput } from '@/lib/services/project-schema';
import type { ProjectInput } from '@/lib/calc/project/types';

export function StepReview({ form }: { form: CreateProjectInput }) {
  // All hooks must run unconditionally (react-hooks/rules-of-hooks). We
  // memoise on `form` and return null-shaped values when invalid so the
  // render branch below can decide what to show.
  const parsed = useMemo(() => CreateProjectSchema.safeParse(form), [form]);

  const projectInput = useMemo<ProjectInput | null>(() => {
    if (!parsed.success) return null;
    const f = parsed.data;
    const villaSqft = f.villa_sqft_ag + f.villa_sqft_bg;
    const programMonths =
      f.sourcing_months +
      f.permitting_preconstruction_months +
      f.construction_months +
      f.sales_months;
    return {
      id: 'preview',
      name: f.name,
      address: f.address ?? null,
      market: f.market_id,
      asset_type: f.asset_type,
      status: f.status,
      stage: f.stage,
      purchase_date: f.purchase_date,
      sourcing_months: f.sourcing_months,
      permitting_preconstruction_months: f.permitting_preconstruction_months,
      construction_months: f.construction_months,
      sales_months: f.sales_months,
      villa_sqft_ag: f.villa_sqft_ag,
      villa_sqft_bg: f.villa_sqft_bg,
      start_date: f.purchase_date,
      villa_sqft: villaSqft,
      program_months: programMonths || 13,
      land_cost_usd: f.land_cost_usd,
      build_cost_per_sqft: f.build_cost_per_sqft ?? null,
      soft_costs_lump_sum: f.soft_costs_lump_sum,
      // Financing fields default to schema → engine uses globals.
    };
  }, [parsed]);

  const result = useMemo(() => {
    if (!projectInput) return null;
    try {
      return runProject(projectInput, BASELINE_GLOBALS, BASELINE_SCENARIO);
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, [projectInput]);

  if (!parsed.success) {
    return (
      <div
        style={{
          padding: '32px 24px',
          textAlign: 'center',
          color: 'var(--color-text-secondary)',
          fontSize: 13,
        }}
      >
        <p style={{ margin: 0 }}>
          Fill in the previous steps before reviewing. Missing or invalid:
        </p>
        <ul style={{ margin: '12px 0 0 0', padding: 0, listStyle: 'none' }}>
          {parsed.error.issues.map((i, idx) => (
            <li
              key={idx}
              style={{
                fontSize: 12,
                color: 'var(--color-negative, #dc2626)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {i.path.join('.')} — {i.message}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!result || 'error' in result) {
    return (
      <p
        role="alert"
        style={{
          margin: 0,
          padding: 16,
          fontSize: 13,
          color: 'var(--color-negative, #dc2626)',
        }}
      >
        Calc engine could not preview this project:{' '}
        {result && 'error' in result ? result.error : 'unknown error'}
      </p>
    );
  }

  const k = result.kpis;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header>
        <h2
          style={{
            fontSize: 16,
            fontWeight: 700,
            margin: 0,
            marginBottom: 4,
            color: 'var(--color-text-primary)',
          }}
        >
          Preview before submit
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: 'var(--color-text-secondary)',
          }}
        >
          KPIs below come from the calc engine running on the form data you&apos;ve just entered.
          Submit creates the project + redirects to its detail page.
        </p>
      </header>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
        }}
      >
        <KPI
          label="Sale value"
          value={formatMoney(k.total_sales * 100, { compact: true, precision: 2 })}
          hint={`@ $${Math.round(k.sale_price_per_sqft).toLocaleString()}/sqft`}
        />
        <KPI
          label="Dev cost"
          value={formatMoney(k.total_dev_cost * 100, { compact: true, precision: 2 })}
          hint="land + build + soft"
        />
        <KPI
          label="Gross profit"
          value={formatMoney(k.gross_profit * 100, { compact: true, precision: 2 })}
          hint={`${(k.profit_margin_pct * 100).toFixed(1)}% margin`}
          accent={k.gross_profit >= 0 ? 'positive' : 'negative'}
        />
        <KPI
          label="IRR (annual)"
          value={k.irr_annual !== null ? `${(k.irr_annual * 100).toFixed(1)}%` : '—'}
          hint="annualized"
        />
        <KPI label="MOIC" value={`${k.moic.toFixed(2)}×`} hint="equity multiple" />
        <KPI
          label="Peak equity"
          value={formatMoney(k.peak_equity * 100, { compact: true, precision: 2 })}
          hint="across program"
        />
      </section>

      <section
        style={{
          background: 'var(--color-surface-base)',
          border: '1px solid var(--color-border-hairline)',
          borderRadius: 12,
          padding: 16,
        }}
      >
        <h3
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-text-tertiary)',
            margin: 0,
            marginBottom: 8,
          }}
        >
          Identity recap
        </h3>
        <dl
          style={{
            margin: 0,
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            columnGap: 16,
            rowGap: 4,
            fontSize: 13,
          }}
        >
          <KV label="Name" value={parsed.data.name} />
          <KV label="Address" value={parsed.data.address ?? '—'} />
          <KV label="Market" value={parsed.data.market_id} />
          <KV label="Purchase" value={parsed.data.purchase_date} />
          <KV label="Sale (computed)" value={result.sale_date ?? '—'} />
          <KV
            label="Total sqft"
            value={`${(parsed.data.villa_sqft_ag + parsed.data.villa_sqft_bg).toLocaleString()} sqft`}
          />
        </dl>
      </section>
    </div>
  );
}

function KPI({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: 'positive' | 'negative';
}) {
  const color =
    accent === 'positive'
      ? 'var(--color-positive, #16a34a)'
      : accent === 'negative'
        ? 'var(--color-negative, #dc2626)'
        : 'var(--color-text-primary)';
  return (
    <div
      style={{
        background: 'var(--color-surface-base)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-text-tertiary)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color,
          fontVariantNumeric: 'tabular-nums',
          marginTop: 2,
        }}
      >
        {value}
      </div>
      {hint && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
            marginTop: 2,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt style={{ color: 'var(--color-text-secondary)' }}>{label}</dt>
      <dd
        style={{
          margin: 0,
          color: 'var(--color-text-primary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </dd>
    </>
  );
}
