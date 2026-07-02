/**
 * V7 T136 — exec block 4: P&L, plan vs latest.
 *
 * The 9-line project P&L (buildProjectPnL — the same numbers the old Summary
 * tab rendered) with the Actuals tab's variance summary folded in as a second
 * column: for each cost category with booked actuals, show actual-to-date and
 * the variance vs plan. No actuals → single Plan column + a muted note
 * (Rule 6: absence is stated, not rendered as $0 overrun).
 */

import type { ProjectPnL } from '@/lib/finance/project-pnl';
import type { ActualsByCategory } from '@/lib/services/actuals';
import type { ActualsCategory } from '@/lib/repos/actuals';
import { formatMoney } from '@/lib/utils/money';

function money(usd: number): string {
  return formatMoney(usd * 100, { compact: true, precision: 2 });
}

interface PnLRow {
  label: string;
  plan: number;
  /** Actuals category this line reconciles against (cost lines only). */
  category?: ActualsCategory;
  sign?: 'revenue' | 'cost' | 'profit';
  strong?: boolean;
}

export function PnLBlock({
  pnl,
  actualsByCategory,
}: {
  pnl: ProjectPnL;
  actualsByCategory: ActualsByCategory[];
}) {
  const actualUsdByCat = new Map<string, number>();
  let entryCount = 0;
  for (const g of actualsByCategory) {
    actualUsdByCat.set(g.category, g.totalCents / 100);
    entryCount += g.entries.length;
  }
  const hasActuals = entryCount > 0;

  const rows: PnLRow[] = [
    { label: 'Gross revenue', plan: pnl.gross_revenue_usd, sign: 'revenue', strong: true },
    { label: 'Land', plan: pnl.land_usd, category: 'land', sign: 'cost' },
    {
      label: 'Hard construction',
      plan: pnl.hard_construction_usd,
      category: 'build',
      sign: 'cost',
    },
    { label: 'Soft costs', plan: pnl.soft_costs_usd, category: 'soft', sign: 'cost' },
    { label: 'Superstructure', plan: pnl.superstructure_usd, category: 'kingshaus', sign: 'cost' },
    { label: 'Financing', plan: pnl.financing_cost_usd, category: 'financing', sign: 'cost' },
    { label: 'Net profit before tax', plan: pnl.net_profit_before_tax_usd, strong: true },
    { label: `Tax (${pnl.tax_rate_pct.toFixed(1)}%)`, plan: pnl.tax_usd, sign: 'cost' },
    {
      label: 'Net profit after tax',
      plan: pnl.net_profit_after_tax_usd,
      sign: 'profit',
      strong: true,
    },
  ];

  return (
    <div>
      {/* Hero margin figures */}
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 14 }}>
        <Fig label="NPAT" value={money(pnl.net_profit_after_tax_usd)} />
        <Fig label="Margin" value={`${(pnl.npat_margin_pct * 100).toFixed(1)}%`} />
        <Fig
          label="IRR (annual)"
          value={pnl.irr_annual !== null ? `${(pnl.irr_annual * 100).toFixed(1)}%` : '—'}
        />
        <Fig label="MOIC" value={`${pnl.moic.toFixed(2)}×`} />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 13,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <thead>
            <tr>
              <Th align="left">Line</Th>
              <Th align="right">Plan</Th>
              {hasActuals && <Th align="right">Actuals to date</Th>}
              {hasActuals && <Th align="right">Variance</Th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const actual = r.category ? actualUsdByCat.get(r.category) : undefined;
              const showActual = hasActuals && r.category !== undefined;
              const variance = actual !== undefined && actual > 0.005 ? actual - r.plan : undefined;
              return (
                <tr key={r.label}>
                  <Td align="left" strong={r.strong}>
                    {r.label}
                  </Td>
                  <Td align="right" strong={r.strong}>
                    {money(r.plan)}
                  </Td>
                  {hasActuals && (
                    <Td
                      align="right"
                      muted={!showActual || actual === undefined || actual <= 0.005}
                    >
                      {showActual && actual !== undefined && actual > 0.005 ? money(actual) : '—'}
                    </Td>
                  )}
                  {hasActuals && (
                    <Td
                      align="right"
                      negative={variance !== undefined && variance > 0}
                      muted={variance === undefined}
                    >
                      {variance !== undefined
                        ? `${variance > 0 ? '+' : ''}${money(variance)}`
                        : '—'}
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 10, color: 'var(--color-text-tertiary)' }}>
        {hasActuals
          ? 'Actuals = booked cost entries to date; variance = actuals − plan (positive = over plan so far, which is expected mid-build).'
          : 'No cost entries booked yet — the Actuals column appears once invoices are logged.'}
        {` Closing costs memo: ${money(pnl.closing_costs_memo_usd)} (not in NPBT).`}
      </p>
    </div>
  );
}

function Fig({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-tertiary)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          marginTop: 2,
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--color-text-primary)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align: 'left' | 'right' }) {
  return (
    <th
      style={{
        fontSize: 10.5,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--color-text-tertiary)',
        padding: '6px 8px',
        fontWeight: 700,
        textAlign: align,
        borderBottom: '1px solid var(--color-border-hairline)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  strong,
  muted,
  negative,
}: {
  children: React.ReactNode;
  align: 'left' | 'right';
  strong?: boolean;
  muted?: boolean;
  negative?: boolean;
}) {
  return (
    <td
      style={{
        padding: '6px 8px',
        textAlign: align,
        borderBottom: '1px solid var(--color-border-subtle)',
        color: negative
          ? 'var(--color-negative, #b91c1c)'
          : muted
            ? 'var(--color-text-tertiary)'
            : 'var(--color-text-primary)',
        fontWeight: strong ? 700 : 400,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </td>
  );
}
