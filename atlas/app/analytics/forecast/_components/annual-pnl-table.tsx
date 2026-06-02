/**
 * Annual P&L roll-up table — server-renderable.
 *
 * Reads PortfolioAnnualEntry per fiscal year. Columns mirror what the
 * vanilla `aggregatePortfolio` emits: sales / cost categories / interest /
 * pre-tax → NOL → tax → after-tax. Number formatting uses tabular nums.
 */

import { formatMoney } from '@/lib/utils/money';
import type { PortfolioAnnualEntry } from '@/lib/calc/portfolio/types';

interface Props {
  annual: Record<string, PortfolioAnnualEntry>;
  effectiveTaxRate: number;
}

interface LineDef {
  label: string;
  pick: (a: PortfolioAnnualEntry) => number;
  bold?: boolean;
}

const LINES: LineDef[] = [
  { label: 'Sales', pick: (a) => a.sales, bold: true },
  { label: 'Land', pick: (a) => a.land },
  { label: 'Build', pick: (a) => a.build },
  { label: 'Superstructure', pick: (a) => a.kingshaus },
  { label: 'Soft', pick: (a) => a.soft },
  { label: 'Opex', pick: (a) => a.opex },
  { label: 'Interest', pick: (a) => a.interest },
  { label: 'Pre-tax profit', pick: (a) => a.profit_before_tax, bold: true },
  { label: 'NOL used', pick: (a) => a.nol_used },
  { label: 'Tax', pick: (a) => a.tax },
  { label: 'After-tax profit', pick: (a) => a.profit_after_tax, bold: true },
];

export function AnnualPnLTable({ annual, effectiveTaxRate }: Props) {
  const years = Object.keys(annual).sort();
  return (
    <section
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 14,
        padding: 24,
        overflowX: 'auto',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 16,
        }}
      >
        <h2
          style={{
            fontSize: 16,
            fontWeight: 600,
            margin: 0,
            color: 'var(--color-text-primary)',
          }}
        >
          Annual P&amp;L
        </h2>
        <span
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-text-tertiary)',
          }}
        >
          effective tax {(effectiveTaxRate * 100).toFixed(1)}%
        </span>
      </header>
      {years.length === 0 ? (
        <p
          style={{
            margin: 0,
            padding: '24px 0',
            textAlign: 'center',
            color: 'var(--color-text-tertiary)',
            fontSize: 13,
          }}
        >
          No annual data in horizon.
        </p>
      ) : (
        <table className="ja-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <Th align="left">Line</Th>
              {years.map((fy) => (
                <Th align="right" key={fy}>
                  {fy}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LINES.map((line) => (
              <tr key={line.label}>
                <td
                  style={{
                    padding: '8px 12px 8px 0',
                    fontSize: 13,
                    fontWeight: line.bold ? 600 : 400,
                    color: 'var(--color-text-primary)',
                    borderBottom: '1px solid var(--color-border-subtle)',
                  }}
                >
                  {line.label}
                </td>
                {years.map((fy) => {
                  const a = annual[fy]!;
                  const v = line.pick(a);
                  return (
                    <td
                      key={fy}
                      style={{
                        padding: '8px 12px 8px 0',
                        fontSize: 13,
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: line.bold ? 600 : 400,
                        color: v === 0 ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
                        borderBottom: '1px solid var(--color-border-subtle)',
                      }}
                    >
                      {v === 0 ? '—' : formatMoney(v * 100, { compact: true, precision: 2 })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Th({ children, align }: { children: React.ReactNode; align: 'left' | 'right' }) {
  return (
    <th
      style={{
        textAlign: align,
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--color-text-tertiary)',
        padding: '8px 12px 8px 0',
        borderBottom: '1px solid var(--color-border-hairline)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}
