/**
 * Project Detail — Capital tab.
 *
 * Two sections:
 *   1. Capital calls (real data from atlas.capital_calls + shares + payments)
 *      - Admins can create / cancel via the action bar.
 *      - Owner role sees only their own commitments (D-011 tier 2 — enforced
 *        server-side by findCapitalCallsByProject({ ownerId })).
 *   2. Financing schedule (calc-engine-derived monthly debt/equity rows —
 *      kept from the original view so the page still works pre-first-call).
 */

import { KPIStrip } from '@/components/data/KPIStrip';
import { KPITile } from '@/components/data/KPITile';
import { formatMoney } from '@/lib/utils/money';
import { CapitalCallsSection } from './capital-calls-section';
import type { ProjectResult } from '@/lib/calc/project/types';
import type { CapitalCallView } from '@/lib/repos/capital-call';
import type { CapTableEntryView } from '@/lib/repos/settings';

interface FlowRow {
  date: string;
  equityDrawn: number;
  equityReturned: number;
  equityBalance: number;
  debtDrawn: number;
  debtRepaid: number;
  debtBalance: number;
}

function buildRows(result: ProjectResult): FlowRow[] {
  const rows: FlowRow[] = [];
  const m = result.monthly;
  for (let i = 0; i < m.dates.length; i++) {
    const row: FlowRow = {
      date: m.dates[i]!,
      equityDrawn: m.equity_drawn[i] ?? 0,
      equityReturned: m.equity_returned[i] ?? 0,
      equityBalance: m.equity_balance[i] ?? 0,
      debtDrawn: m.debt_drawn[i] ?? 0,
      debtRepaid: m.debt_repaid[i] ?? 0,
      debtBalance: m.debt_balance[i] ?? 0,
    };
    if (
      row.equityDrawn !== 0 ||
      row.equityReturned !== 0 ||
      row.debtDrawn !== 0 ||
      row.debtRepaid !== 0 ||
      row.equityBalance !== 0 ||
      row.debtBalance !== 0
    ) {
      rows.push(row);
    }
  }
  return rows;
}

export function CapitalTab({
  result,
  projectUuid,
  calls,
  capTable,
  isAdmin,
}: {
  result: ProjectResult;
  projectUuid: string | null;
  calls: CapitalCallView[];
  capTable: CapTableEntryView[];
  isAdmin: boolean;
}) {
  const rows = buildRows(result);
  const k = result.kpis;

  // Roll-up of called-vs-funded across all calls (admin-only meaningful;
  // owners see only their own).
  const totalCalledCents = calls.reduce((s, c) => s + c.totalAmountCents, 0);
  const totalFundedCents = calls.reduce(
    (s, c) => s + c.shares.reduce((sh, share) => sh + share.paidCents, 0),
    0
  );
  const fundedPct = totalCalledCents > 0 ? totalFundedCents / totalCalledCents : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <KPIStrip columns={4}>
        <KPITile
          label="Peak debt"
          value={formatMoney(k.peak_debt * 100, { compact: true, precision: 2 })}
          hint="senior facility"
        />
        <KPITile
          label="Peak equity"
          value={formatMoney(k.peak_equity * 100, { compact: true, precision: 2 })}
          hint="LOC + true equity"
        />
        <KPITile
          label="Called to date"
          value={formatMoney(totalCalledCents, { compact: true, precision: 2 })}
          hint={`${calls.length} ${calls.length === 1 ? 'call' : 'calls'}`}
        />
        <KPITile
          label="Funded"
          value={formatMoney(totalFundedCents, { compact: true, precision: 2 })}
          hint={`${(fundedPct * 100).toFixed(0)}% of called`}
        />
      </KPIStrip>

      <CapitalCallsSection
        projectUuid={projectUuid}
        calls={calls}
        capTable={capTable}
        isAdmin={isAdmin}
      />

      <FinancingScheduleCard rows={rows} />
    </div>
  );
}

function FinancingScheduleCard({ rows }: { rows: FlowRow[] }) {
  return (
    <section
      style={{
        background: 'var(--ja-card-bg)',
        border: 'var(--ja-card-border)',
        borderRadius: 'var(--ja-card-radius)',
        padding: 'var(--ja-card-padding)',
        overflowX: 'auto',
      }}
    >
      <h2
        style={{
          fontSize: 16,
          fontWeight: 700,
          margin: 0,
          marginBottom: 4,
          color: 'var(--color-text-primary)',
        }}
      >
        Financing schedule
      </h2>
      <p
        style={{
          margin: 0,
          marginBottom: 16,
          fontSize: 12,
          color: 'var(--color-text-tertiary)',
        }}
      >
        Calc-engine monthly debt + equity flow. Independent of recorded capital calls above.
      </p>
      <table className="ja-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <Th align="left">Month</Th>
            <Th align="right">Equity drawn</Th>
            <Th align="right">Equity returned</Th>
            <Th align="right">Equity balance</Th>
            <Th align="right">Debt drawn</Th>
            <Th align="right">Debt repaid</Th>
            <Th align="right">Debt balance</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.date}>
              <Td>{r.date}</Td>
              <TdN>{r.equityDrawn}</TdN>
              <TdN>{r.equityReturned}</TdN>
              <TdN bold>{r.equityBalance}</TdN>
              <TdN>{r.debtDrawn}</TdN>
              <TdN>{r.debtRepaid}</TdN>
              <TdN bold>{r.debtBalance}</TdN>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={7}
                style={{
                  padding: '24px 0',
                  textAlign: 'center',
                  color: 'var(--color-text-tertiary)',
                  fontSize: 13,
                }}
              >
                No financing activity in window.
              </td>
            </tr>
          )}
        </tbody>
      </table>
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

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td
      style={{
        padding: '6px 12px 6px 0',
        fontSize: 13,
        color: 'var(--color-text-primary)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </td>
  );
}

function TdN({ children, bold = false }: { children: number; bold?: boolean }) {
  return (
    <td
      style={{
        padding: '6px 12px 6px 0',
        fontSize: 13,
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
        fontWeight: bold ? 600 : 400,
        color: children === 0 ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
        whiteSpace: 'nowrap',
      }}
    >
      {children === 0 ? '—' : formatMoney(children * 100, { precision: 0 })}
    </td>
  );
}
