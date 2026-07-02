/**
 * V7 T136 — exec block 3: Cash requirements (per project).
 *
 * When this project needs money and from where: equity + senior-debt draws
 * by month (the engine's own funding series), peak equity/debt, and
 * remaining-to-fund from today. Every number is the SAME runProject output
 * the rest of the page renders (Rule 1 — no independent recompute).
 *
 * NOTE: the KPC LOC is a PORTFOLIO-level overlay (allocated across projects
 * by the cash schedule on Home #capital) — a per-project LOC column would be
 * new math, so it is deliberately not shown here.
 */

import type { ProjectResult } from '@/lib/calc/project/types';
import { formatMoney } from '@/lib/utils/money';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtYM(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m ?? 1) - 1] ?? ''} ${(y ?? '').slice(2)}`;
}

function money(usd: number): string {
  if (Math.abs(usd) < 0.5) return '—';
  return formatMoney(usd * 100, { compact: true, precision: 2 });
}

export function RequirementsBlock({ result, todayYM }: { result: ProjectResult; todayYM: string }) {
  const m = result.monthly;

  // Rows: months with any funding activity (equity or debt drawn, or inflow).
  const rows: Array<{
    month: string;
    equity: number;
    debt: number;
    inflow: number;
    cumFunded: number;
  }> = [];
  let cum = 0;
  for (let i = 0; i < m.dates.length; i++) {
    const equity = m.equity_drawn[i] ?? 0;
    const debt = m.debt_drawn[i] ?? 0;
    const inflow = (m.sales[i] ?? 0) + (m.equity_returned[i] ?? 0);
    cum += equity + debt;
    if (equity > 0.5 || debt > 0.5 || inflow > 0.5) {
      rows.push({ month: m.dates[i]!, equity, debt, inflow, cumFunded: cum });
    }
  }

  // Remaining-to-fund from today = draws scheduled in months >= todayYM.
  let remainingEquity = 0;
  let remainingDebt = 0;
  for (let i = 0; i < m.dates.length; i++) {
    if (m.dates[i]! >= todayYM) {
      remainingEquity += m.equity_drawn[i] ?? 0;
      remainingDebt += m.debt_drawn[i] ?? 0;
    }
  }

  return (
    <div>
      {/* Summary figures */}
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 14 }}>
        <Fig label="Peak equity" value={money(result.kpis.peak_equity)} />
        <Fig label="Peak senior debt" value={money(result.kpis.peak_debt)} />
        <Fig label="Remaining to fund" value={money(remainingEquity + remainingDebt)} />
        <Fig label="of which equity" value={money(remainingEquity)} muted />
        <Fig label="of which senior debt" value={money(remainingDebt)} muted />
      </div>

      {rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
          No funding activity in the model horizon.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12.5,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <thead>
              <tr>
                <Th align="left">Month</Th>
                <Th align="right">Equity draw</Th>
                <Th align="right">Senior-debt draw</Th>
                <Th align="right">Inflows</Th>
                <Th align="right">Cumulative funded</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const past = r.month < todayYM;
                return (
                  <tr key={r.month} style={past ? { opacity: 0.55 } : {}}>
                    <Td align="left">{fmtYM(r.month)}</Td>
                    <Td align="right">{money(r.equity)}</Td>
                    <Td align="right">{money(r.debt)}</Td>
                    <Td align="right" muted>
                      {money(r.inflow)}
                    </Td>
                    <Td align="right" muted>
                      {money(r.cumFunded)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ margin: '10px 0 0', fontSize: 10, color: 'var(--color-text-tertiary)' }}>
        Engine funding series (equity first, then senior debt). The KPC LOC is allocated at
        portfolio level — see Home → Capital &amp; LOC. Dimmed rows are before the current month.
      </p>
    </div>
  );
}

function Fig({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
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
          fontSize: muted ? 14 : 18,
          fontWeight: 700,
          marginTop: 2,
          fontVariantNumeric: 'tabular-nums',
          color: muted ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
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
  muted,
}: {
  children: React.ReactNode;
  align: 'left' | 'right';
  muted?: boolean;
}) {
  return (
    <td
      style={{
        padding: '5px 8px',
        textAlign: align,
        borderBottom: '1px solid var(--color-border-subtle)',
        color: muted ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </td>
  );
}
