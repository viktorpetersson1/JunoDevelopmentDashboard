/**
 * Project Detail — Sales tab (enhanced for T067).
 *
 * Three sections:
 *   1. KPI strip — list value / per-sqft / margin / target close.
 *   2. Sales lifecycle progression — listed → under contract → closed,
 *      with actual list price + actual sale price + variance vs planned
 *      when the dates / amounts are populated on the project row.
 *   3. Sale-recognition schedule — calc engine monthly sale rows
 *      (matters for multi-villa projects spreading proceeds).
 */

import { KPIStrip } from '@/components/data/KPIStrip';
import { KPITile } from '@/components/data/KPITile';
import { formatMoney, toCents } from '@/lib/utils/money';
import type { ProjectInput, ProjectResult } from '@/lib/calc/project/types';

interface SaleMonth {
  date: string;
  amount: number;
}

type LifecyclePhase = 'planning' | 'listed' | 'under_contract' | 'closed';

interface PhaseInfo {
  phase: LifecyclePhase;
  label: string;
  blurb: string;
}

function inferPhase(project: ProjectInput): PhaseInfo {
  if (project.closing_date && project.actual_sale_price_usd != null) {
    return { phase: 'closed', label: 'Closed', blurb: 'Sale complete and recorded' };
  }
  if (project.under_contract_date) {
    return {
      phase: 'under_contract',
      label: 'Under contract',
      blurb: 'Accepted offer, awaiting closing',
    };
  }
  if (project.listing_date) {
    return { phase: 'listed', label: 'Listed', blurb: 'Active in the market' };
  }
  return { phase: 'planning', label: 'Planning', blurb: 'Pre-listing' };
}

const PHASE_ORDER: LifecyclePhase[] = ['planning', 'listed', 'under_contract', 'closed'];

export function SalesTab({
  project,
  result,
}: {
  project: ProjectInput;
  result: ProjectResult;
}) {
  const k = result.kpis;
  const saleMonths: SaleMonth[] = [];
  for (let i = 0; i < result.monthly.dates.length; i++) {
    const amt = result.monthly.sales[i] ?? 0;
    if (amt > 0) saleMonths.push({ date: result.monthly.dates[i]!, amount: amt });
  }
  const phaseInfo = inferPhase(project);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <KPIStrip columns={4}>
        <KPITile
          label="List value"
          value={formatMoney(k.total_sales * 100, { compact: true, precision: 2 })}
          hint={
            saleMonths.length > 1 ? `across ${saleMonths.length} villas` : 'single villa'
          }
        />
        <KPITile
          label="Per sqft"
          value={`$${Math.round(k.sale_price_per_sqft).toLocaleString()}`}
          hint={`${(project.villa_sqft ?? 0).toLocaleString()} sqft`}
        />
        <KPITile
          label="Margin"
          value={`${(k.profit_margin_pct * 100).toFixed(1)}%`}
          delta={{
            value: formatMoney(k.gross_profit * 100, { compact: true, precision: 1 }),
            direction: k.gross_profit >= 0 ? 'up' : 'down',
          }}
        />
        <KPITile
          label="Target close"
          value={result.sale_date ?? '—'}
          hint={project.closing_date ?? undefined}
        />
      </KPIStrip>

      <LifecycleCard project={project} phase={phaseInfo} plannedSaleUsd={k.total_sales} />

      <SaleScheduleCard saleMonths={saleMonths} />
    </div>
  );
}

// ─── Lifecycle progression ─────────────────────────────────────────────────

function LifecycleCard({
  project,
  phase,
  plannedSaleUsd,
}: {
  project: ProjectInput;
  phase: PhaseInfo;
  plannedSaleUsd: number;
}) {
  const plannedCents = toCents(plannedSaleUsd);
  const listingCents = project.listing_price_usd != null ? toCents(project.listing_price_usd) : null;
  const actualCents = project.actual_sale_price_usd != null ? toCents(project.actual_sale_price_usd) : null;

  const varianceVsPlanCents = actualCents != null ? actualCents - plannedCents : null;
  const varianceVsPlanPct =
    actualCents != null && plannedCents > 0 ? (actualCents - plannedCents) / plannedCents : null;

  const varianceVsListCents =
    actualCents != null && listingCents != null ? actualCents - listingCents : null;
  const varianceVsListPct =
    actualCents != null && listingCents != null && listingCents > 0
      ? (actualCents - listingCents) / listingCents
      : null;

  return (
    <section
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 14,
        padding: 24,
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <h2
          style={{
            fontSize: 16,
            fontWeight: 600,
            margin: 0,
            color: 'var(--color-text-primary)',
          }}
        >
          Sales lifecycle
        </h2>
        <p
          style={{
            margin: '4px 0 0 0',
            fontSize: 12,
            color: 'var(--color-text-tertiary)',
          }}
        >
          Phase: <strong style={{ color: 'var(--color-text-secondary)' }}>{phase.label}</strong>
          {' · '}
          {phase.blurb}
        </p>
      </header>

      <ol
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          listStyle: 'none',
          padding: 0,
          margin: 0,
          gap: 8,
        }}
      >
        {PHASE_ORDER.map((p) => (
          <PhaseChip
            key={p}
            label={
              p === 'planning'
                ? 'Planning'
                : p === 'listed'
                  ? 'Listed'
                  : p === 'under_contract'
                    ? 'Under contract'
                    : 'Closed'
            }
            date={
              p === 'planning'
                ? project.purchase_date ?? null
                : p === 'listed'
                  ? project.listing_date ?? null
                  : p === 'under_contract'
                    ? project.under_contract_date ?? null
                    : project.closing_date ?? null
            }
            active={p === phase.phase}
            done={PHASE_ORDER.indexOf(p) < PHASE_ORDER.indexOf(phase.phase)}
          />
        ))}
      </ol>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 20 }}>
        <tbody>
          <PriceRow
            label="Planned sale"
            value={formatMoney(plannedCents, { precision: 0 })}
            note="Calc engine target"
          />
          <PriceRow
            label="Listing price"
            value={listingCents != null ? formatMoney(listingCents, { precision: 0 }) : '—'}
            note={project.listing_date ? `Listed ${project.listing_date}` : 'Not listed yet'}
          />
          <PriceRow
            label="Actual sale"
            value={actualCents != null ? formatMoney(actualCents, { precision: 0 }) : '—'}
            note={project.closing_date ? `Closed ${project.closing_date}` : 'Not closed yet'}
            highlight
          />
          {varianceVsPlanCents !== null && (
            <VarianceRow
              label="vs plan"
              valueCents={varianceVsPlanCents}
              pct={varianceVsPlanPct}
            />
          )}
          {varianceVsListCents !== null && (
            <VarianceRow
              label="vs listing"
              valueCents={varianceVsListCents}
              pct={varianceVsListPct}
            />
          )}
        </tbody>
      </table>
    </section>
  );
}

function PhaseChip({
  label,
  date,
  active,
  done,
}: {
  label: string;
  date: string | null;
  active: boolean;
  done: boolean;
}) {
  const fg = active
    ? '#fff'
    : done
      ? 'var(--color-text-secondary)'
      : 'var(--color-text-tertiary)';
  const bg = active
    ? 'var(--color-accent-base, #131313)'
    : done
      ? 'var(--color-surface-base)'
      : 'transparent';
  const border = active
    ? 'transparent'
    : done
      ? 'var(--color-border-hairline)'
      : 'var(--color-border-hairline)';
  const borderStyle = active ? 'solid' : done ? 'solid' : 'dashed';
  return (
    <li
      style={{
        padding: '10px 12px',
        background: bg,
        color: fg,
        borderRadius: 8,
        border: `1px ${borderStyle} ${border}`,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', opacity: 0.85 }}>
        {date ?? '—'}
      </span>
    </li>
  );
}

function PriceRow({
  label,
  value,
  note,
  highlight = false,
}: {
  label: string;
  value: string;
  note?: string;
  highlight?: boolean;
}) {
  return (
    <tr>
      <td
        style={{
          padding: '8px 0',
          fontSize: 13,
          color: 'var(--color-text-secondary)',
          borderBottom: '1px solid var(--color-border-subtle)',
          width: 140,
        }}
      >
        {label}
      </td>
      <td
        style={{
          padding: '8px 12px 8px 0',
          fontSize: 13,
          fontVariantNumeric: 'tabular-nums',
          fontWeight: highlight ? 600 : 400,
          color: 'var(--color-text-primary)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        {value}
      </td>
      <td
        style={{
          padding: '8px 0',
          fontSize: 12,
          color: 'var(--color-text-tertiary)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        {note ?? ''}
      </td>
    </tr>
  );
}

function VarianceRow({
  label,
  valueCents,
  pct,
}: {
  label: string;
  valueCents: number;
  pct: number | null;
}) {
  const color =
    valueCents > 0
      ? 'var(--color-positive, #16a34a)'
      : valueCents < 0
        ? 'var(--color-negative, #dc2626)'
        : 'var(--color-text-tertiary)';
  return (
    <tr>
      <td
        style={{
          padding: '8px 0',
          fontSize: 12,
          color: 'var(--color-text-tertiary)',
          textAlign: 'right',
          paddingRight: 12,
        }}
      >
        {label}
      </td>
      <td
        style={{
          padding: '8px 12px 8px 0',
          fontSize: 13,
          textAlign: 'left',
          fontVariantNumeric: 'tabular-nums',
          color,
        }}
      >
        {valueCents > 0 ? '+' : ''}
        {formatMoney(valueCents, { precision: 0 })}
        {pct !== null && (
          <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            ({(pct * 100).toFixed(1)}%)
          </span>
        )}
      </td>
      <td />
    </tr>
  );
}

// ─── Recognition schedule (preserved from the original view) ─────────────

function SaleScheduleCard({ saleMonths }: { saleMonths: SaleMonth[] }) {
  return (
    <section
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 14,
        padding: 24,
      }}
    >
      <h2
        style={{
          fontSize: 16,
          fontWeight: 600,
          margin: 0,
          marginBottom: 16,
          color: 'var(--color-text-primary)',
        }}
      >
        Sale recognition schedule
      </h2>
      <table className="ja-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th
              style={{
                textAlign: 'left',
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--color-text-tertiary)',
                padding: '8px 0',
                borderBottom: '1px solid var(--color-border-hairline)',
              }}
            >
              Closing month
            </th>
            <th
              style={{
                textAlign: 'right',
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--color-text-tertiary)',
                padding: '8px 0',
                borderBottom: '1px solid var(--color-border-hairline)',
              }}
            >
              Proceeds
            </th>
          </tr>
        </thead>
        <tbody>
          {saleMonths.map((m) => (
            <tr key={m.date}>
              <td style={{ padding: '6px 0', fontSize: 13, color: 'var(--color-text-primary)' }}>
                {m.date}
              </td>
              <td
                style={{
                  padding: '6px 0',
                  fontSize: 13,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--color-text-primary)',
                }}
              >
                {formatMoney(m.amount * 100, { precision: 0 })}
              </td>
            </tr>
          ))}
          {saleMonths.length === 0 && (
            <tr>
              <td
                colSpan={2}
                style={{
                  padding: '24px 0',
                  textAlign: 'center',
                  color: 'var(--color-text-tertiary)',
                  fontSize: 13,
                }}
              >
                No sale months scheduled in window.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
