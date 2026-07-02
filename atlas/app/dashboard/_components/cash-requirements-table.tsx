/**
 * V7 T135 — Home cash-requirements table (12 months).
 *
 * "How much do we need and when." Pure presentation over the
 * buildCashRequirements derivation (Rule 1: no numbers computed here beyond
 * formatting). Server-renderable — no client JS.
 */

import type { CashRequirements } from '@/lib/treasury/cash-requirements';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtYM(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m ?? 1) - 1] ?? ''} ${(y ?? '').slice(2)}`;
}

function money(usd: number): string {
  const abs = Math.abs(usd);
  if (abs < 0.5) return '—';
  const s = usd < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${s}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${s}$${(abs / 1_000).toFixed(0)}k`;
  return `${s}$${Math.round(abs)}`;
}

export function CashRequirementsTable({ req }: { req: CashRequirements }) {
  return (
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
            <Th align="right">Project draws</Th>
            <Th align="right">Overhead</Th>
            <Th align="right">LOC draw / repay</Th>
            <Th align="right">Equity call</Th>
            <Th align="right">Cash in</Th>
            <Th align="right">Closing cash</Th>
          </tr>
        </thead>
        <tbody>
          {req.rows.map((r) => {
            const isPeak = r.month === req.peak_month;
            return (
              <tr key={r.month} style={isPeak ? { background: 'var(--color-surface-raised)' } : {}}>
                <Td align="left" bold={isPeak}>
                  {fmtYM(r.month)}
                  {isPeak && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      peak
                    </span>
                  )}
                </Td>
                <Td align="right">{money(r.project_draws)}</Td>
                <Td align="right" muted>
                  {money(r.overhead)}
                </Td>
                <Td align="right">
                  {r.loc_drawn > 0.5 && `+${money(r.loc_drawn)}`}
                  {r.loc_drawn > 0.5 && r.loc_repaid > 0.5 && ' / '}
                  {r.loc_repaid > 0.5 && `−${money(r.loc_repaid)}`}
                  {r.loc_drawn <= 0.5 && r.loc_repaid <= 0.5 && '—'}
                </Td>
                <Td align="right">{money(r.equity_call)}</Td>
                <Td align="right" muted>
                  {money(r.cash_in)}
                </Td>
                <Td align="right" negative={r.closing_cash < -0.5}>
                  {money(r.closing_cash)}
                </Td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid var(--color-border-hairline)' }}>
            <Td align="left" bold>
              12-month total
            </Td>
            <Td align="right" bold>
              {money(req.rows.reduce((s, r) => s + r.project_draws, 0))}
            </Td>
            <Td align="right" muted>
              {money(req.rows.reduce((s, r) => s + r.overhead, 0))}
            </Td>
            <Td align="right">—</Td>
            <Td align="right" bold>
              {money(req.rows.reduce((s, r) => s + r.equity_call, 0))}
            </Td>
            <Td align="right" muted>
              {money(req.rows.reduce((s, r) => s + r.cash_in, 0))}
            </Td>
            <Td align="right">—</Td>
          </tr>
        </tfoot>
      </table>
      <p style={{ margin: '10px 0 0', fontSize: 10, color: 'var(--color-text-tertiary)' }}>
        Project draws = debt- + equity-funded consumption from the 36-month cash schedule; overhead
        = fixed company overhead / 12; closing cash = cumulative (cash in − draws − overhead), LOC
        flows net out. Same schedule as every other number on this page.
      </p>
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
  bold,
  muted,
  negative,
}: {
  children: React.ReactNode;
  align: 'left' | 'right';
  bold?: boolean;
  muted?: boolean;
  negative?: boolean;
}) {
  return (
    <td
      style={{
        padding: '5px 8px',
        textAlign: align,
        borderBottom: '1px solid var(--color-border-subtle)',
        color: negative
          ? 'var(--color-negative, #b91c1c)'
          : muted
            ? 'var(--color-text-tertiary)'
            : 'var(--color-text-primary)',
        fontWeight: bold ? 700 : 400,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </td>
  );
}
