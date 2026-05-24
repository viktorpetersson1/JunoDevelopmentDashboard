/**
 * Project Detail — Summary tab content. Server-renderable (no client state).
 *
 * Renders the 6 KPI hero tiles per `design-system/INVENTORY.md §7`:
 *   Dev cost, Sale value, Profit, Margin, IRR, MOIC
 *
 * Plus Sources vs Uses tables.
 */

import { KPIStrip } from '@/components/data/KPIStrip';
import { KPITile } from '@/components/data/KPITile';
import { formatMoney } from '@/lib/utils/money';
import type { ProjectResult } from '@/lib/calc/project/types';

export function SummaryTab({ result }: { result: ProjectResult }) {
  const k = result.kpis;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <KPIStrip columns={6}>
        <KPITile
          label="Dev cost"
          value={formatMoney(k.total_dev_cost * 100, { compact: true, precision: 2 })}
          hint="land + build + soft"
        />
        <KPITile
          label="Sale value"
          value={formatMoney(k.total_sales * 100, { compact: true, precision: 2 })}
          hint={`@ $${Math.round(k.sale_price_per_sqft).toLocaleString()}/sqft`}
        />
        <KPITile
          label="Profit"
          value={formatMoney(k.gross_profit * 100, { compact: true, precision: 2 })}
          delta={{
            value: `${(k.profit_margin_pct * 100).toFixed(1)}%`,
            direction: k.gross_profit >= 0 ? 'up' : 'down',
          }}
        />
        <KPITile label="Margin" value={`${(k.profit_margin_pct * 100).toFixed(1)}%`} />
        <KPITile
          label="IRR"
          value={k.irr_annual !== null ? `${(k.irr_annual * 100).toFixed(1)}%` : '—'}
          hint="annualized"
        />
        <KPITile label="MOIC" value={`${k.moic.toFixed(2)}×`} hint="equity multiple" />
      </KPIStrip>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.55fr 1fr',
          gap: 24,
        }}
      >
        <SourcesUsesCard result={result} />
        <RailMeta result={result} />
      </div>
    </div>
  );
}

function SourcesUsesCard({ result }: { result: ProjectResult }) {
  const k = result.kpis;
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
        Sources &amp; uses
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        <div>
          <h3 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-tertiary)', margin: 0, marginBottom: 8 }}>
            Sources
          </h3>
          <KV label="Senior debt (peak)" value={formatMoney(k.peak_debt * 100, { precision: 0 })} />
          <KV label="Equity / LOC (peak)" value={formatMoney(k.peak_equity * 100, { precision: 0 })} />
          <KV label="Gross sale proceeds" value={formatMoney(k.total_sales * 100, { precision: 0 })} bold />
        </div>
        <div>
          <h3 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-tertiary)', margin: 0, marginBottom: 8 }}>
            Uses
          </h3>
          <KV label="Dev cost" value={formatMoney(k.total_dev_cost * 100, { precision: 0 })} />
          <KV label="Financing cost" value={formatMoney(k.total_interest * 100, { precision: 0 })} />
          <KV
            label="Net profit"
            value={formatMoney(k.gross_profit * 100, { precision: 0 })}
            bold
          />
        </div>
      </div>
    </section>
  );
}

function RailMeta({ result }: { result: ProjectResult }) {
  return (
    <aside
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
          marginBottom: 16,
        }}
      >
        Schedule
      </h3>
      <KV label="Start" value={result.start_date ?? '—'} />
      <KV label="Sale" value={result.sale_date ?? '—'} />
    </aside>
  );
}

function KV({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 0',
        borderBottom: '1px solid var(--color-border-subtle)',
        fontSize: 13,
      }}
    >
      <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <span
        style={{
          fontVariantNumeric: 'tabular-nums',
          fontWeight: bold ? 600 : 400,
          color: 'var(--color-text-primary)',
        }}
      >
        {value}
      </span>
    </div>
  );
}
