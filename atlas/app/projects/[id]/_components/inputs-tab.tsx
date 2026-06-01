/**
 * Project Detail — Inputs tab. Server-renderable.
 *
 * Read-only echo of the project record the calc engine consumed. Lets owners
 * audit "what numbers went into this run" without diving into the DB.
 *
 * Edit affordance ships with the New Project Wizard (T065 follow-up).
 */

import { formatMoney } from '@/lib/utils/money';
import type { ProjectInput } from '@/lib/calc/project/types';
import {
  waterfrontLabel,
  viewPremiumLabel,
  townProximityLabel,
} from '@/lib/pricing/location-factors';

interface KV {
  label: string;
  value: string;
}

function fmtMoney(usd: number | null | undefined): string {
  if (usd === null || usd === undefined) return '—';
  return formatMoney(usd * 100, { precision: 0 });
}

function fmtPct(decimal: number | null | undefined): string {
  if (decimal === null || decimal === undefined) return '—';
  return `${(decimal * 100).toFixed(2)}%`;
}

function fmtNum(n: number | null | undefined, suffix = ''): string {
  if (n === null || n === undefined) return '—';
  return `${n.toLocaleString()}${suffix}`;
}

function fmtStr(s: string | null | undefined): string {
  if (s === null || s === undefined || s === '') return '—';
  return s;
}

export function InputsTab({ project }: { project: ProjectInput }) {
  const identity: KV[] = [
    { label: 'ID', value: project.id },
    { label: 'Name', value: project.name },
    { label: 'Address', value: fmtStr(project.address) },
    { label: 'Entity / SPV', value: fmtStr(project.entity_spv) },
    { label: 'Market', value: fmtStr(project.market) },
    { label: 'Asset type', value: fmtStr(project.asset_type) },
    { label: 'Status', value: fmtStr(project.status) },
    { label: 'Stage', value: fmtStr(project.stage) },
  ];

  const hasLocationFactor =
    project.waterfront_type != null ||
    project.view_premium != null ||
    project.town_proximity != null ||
    project.lot_size_acres != null ||
    project.year_built != null;

  const location: KV[] = [
    {
      label: 'Waterfront',
      value: project.waterfront_type ? waterfrontLabel(project.waterfront_type) : '—',
    },
    {
      label: 'Water view',
      value: project.view_premium ? viewPremiumLabel(project.view_premium) : '—',
    },
    {
      label: 'Town proximity',
      value: project.town_proximity ? townProximityLabel(project.town_proximity) : '—',
    },
    { label: 'Lot size', value: fmtNum(project.lot_size_acres, ' acres') },
    {
      label: 'Year built',
      value: project.year_built != null ? String(project.year_built) : '—',
    },
  ];

  const program: KV[] = [
    { label: 'Purchase date', value: fmtStr(project.purchase_date ?? project.start_date) },
    { label: 'Sourcing', value: fmtNum(project.sourcing_months, ' mo') },
    {
      label: 'Permitting',
      value: fmtNum(project.permitting_preconstruction_months, ' mo'),
    },
    { label: 'Construction', value: fmtNum(project.construction_months, ' mo') },
    { label: 'Sales', value: fmtNum(project.sales_months, ' mo') },
    { label: 'Program (total)', value: fmtNum(project.program_months, ' mo') },
    { label: 'Sqft above grade', value: fmtNum(project.villa_sqft_ag, ' sqft') },
    { label: 'Sqft below grade', value: fmtNum(project.villa_sqft_bg, ' sqft') },
    { label: 'Sqft (total)', value: fmtNum(project.villa_sqft, ' sqft') },
  ];

  const costs: KV[] = [
    { label: 'Land cost', value: fmtMoney(project.land_cost_usd) },
    {
      label: 'Build $/sqft',
      value:
        project.build_cost_per_sqft != null
          ? `$${project.build_cost_per_sqft.toLocaleString()}`
          : 'default',
    },
    {
      label: 'Superstructure $/sqft',
      value:
        project.kingshaus_cost_per_sqft != null
          ? `$${project.kingshaus_cost_per_sqft.toLocaleString()}`
          : 'default',
    },
    { label: 'Soft costs (lump)', value: fmtMoney(project.soft_costs_lump_sum) },
  ];

  const financing: KV[] = [
    { label: 'Lender', value: fmtStr(project.lender_name) },
    { label: 'Senior LTV', value: fmtPct(project.senior_ltv_pct) },
    { label: 'Interest rate', value: fmtPct(project.interest_rate_apr) },
    { label: 'LTC', value: fmtPct(project.ltc_pct) },
    { label: 'Origination fee', value: fmtPct(project.origination_fee_pct) },
    { label: 'Exit fee', value: fmtPct(project.exit_fee_pct) },
    { label: 'Interest reserve', value: fmtMoney(project.interest_reserve_usd) },
    { label: 'Servicing fee', value: fmtMoney(project.loan_servicing_fee_usd) },
    { label: 'Closing costs', value: fmtMoney(project.closing_costs_usd) },
    {
      label: 'Tax rate',
      value: project.tax_rate_pct != null ? `${project.tax_rate_pct}%` : '25%',
    },
  ];

  const revenue: KV[] = [
    { label: 'Sale price override', value: fmtMoney(project.sale_price_override_usd) },
    {
      label: '$ / sqft override',
      value:
        project.sale_price_per_sqft_override != null
          ? `$${project.sale_price_per_sqft_override.toLocaleString()}`
          : '—',
    },
    { label: 'Target margin', value: fmtPct(project.target_margin) },
  ];

  const sales: KV[] = [
    { label: 'Listing date', value: fmtStr(project.listing_date) },
    { label: 'Under contract', value: fmtStr(project.under_contract_date) },
    { label: 'Closing date', value: fmtStr(project.closing_date) },
    { label: 'Listing price', value: fmtMoney(project.listing_price_usd) },
    { label: 'Actual sale price', value: fmtMoney(project.actual_sale_price_usd) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p
        style={{
          fontSize: 12,
          color: 'var(--color-text-tertiary)',
          margin: 0,
          paddingBottom: 4,
        }}
      >
        Read-only. The editable wizard ships in T065.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 16,
        }}
      >
        <Card title="Identity" rows={identity} />
        {hasLocationFactor && <Card title="Location & site" rows={location} />}
        <Card title="Program" rows={program} />
        <Card title="Costs" rows={costs} />
        <Card title="Financing" rows={financing} />
        <Card title="Revenue" rows={revenue} />
        <Card title="Sales lifecycle" rows={sales} />
      </div>
    </div>
  );
}

function Card({ title, rows }: { title: string; rows: KV[] }) {
  return (
    <section
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 14,
        padding: 24,
      }}
    >
      <h3
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-text-tertiary)',
          margin: 0,
          marginBottom: 12,
        }}
      >
        {title}
      </h3>
      <dl style={{ margin: 0 }}>
        {rows.map((r, i) => (
          <div
            key={r.label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '6px 0',
              borderBottom: i < rows.length - 1 ? '1px solid var(--color-border-subtle)' : 'none',
              fontSize: 13,
            }}
          >
            <dt style={{ color: 'var(--color-text-secondary)' }}>{r.label}</dt>
            <dd
              style={{
                margin: 0,
                color: 'var(--color-text-primary)',
                fontVariantNumeric: 'tabular-nums',
                textAlign: 'right',
              }}
            >
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
