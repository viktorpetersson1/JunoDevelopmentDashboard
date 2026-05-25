/**
 * Project Detail — Sales tab. Server-renderable.
 *
 * Shows the planned sale: list price, $/sqft, expected close, monthly
 * recognition (matters for multi-villa projects where vanilla engine
 * spreads sale across months in monthly.sales).
 *
 * Real pipeline & buyer-side data ships in T067 (W4); for now this is the
 * planning view.
 */

import { KPIStrip } from '@/components/data/KPIStrip';
import { KPITile } from '@/components/data/KPITile';
import { formatMoney } from '@/lib/utils/money';
import type { ProjectInput, ProjectResult } from '@/lib/calc/project/types';

interface SaleMonth {
  date: string;
  amount: number;
}

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
                <td
                  style={{
                    padding: '6px 0',
                    fontSize: 13,
                    color: 'var(--color-text-primary)',
                  }}
                >
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
    </div>
  );
}
