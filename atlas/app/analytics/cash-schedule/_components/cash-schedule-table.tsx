'use client';

/**
 * V6.2 T120 — Cash schedule table.
 *
 * Wide horizontally-scrollable table with 36 months × the active sources.
 * Sticky-left columns (month + totals) and sticky-right column (notes/breach
 * count). Per-source columns repeat the (drawn / repaid / balance / headroom)
 * tetrad — wide but it's the way to surface the data the plan calls for.
 *
 * Covenant-breach months show a StatusDot in the notes cell with the
 * formula in the popover (TR5).
 */

import { useState } from 'react';
import type { CashSchedule } from '@/lib/treasury/portfolio-cash-schedule';
import { StatusDot } from '@/components/feedback/StatusDot';
import { formatMoney } from '@/lib/utils/money';

const SOURCE_KIND_LABELS: Record<string, string> = {
  kpc_loc: 'KPC LOC',
  project_finance: 'Project finance',
  recycled_equity: 'Recycled equity',
};

function fmtUsd(n: number): string {
  if (Math.abs(n) < 1) return '—';
  return formatMoney(n * 100, { compact: true, precision: 1 });
}

function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-');
  const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${MONTHS[Number(m ?? 1) - 1]} '${y?.slice(2) ?? ''}`;
}

export function CashScheduleTable({ schedule }: { schedule: CashSchedule }) {
  const sourceIds = Object.keys(schedule.sources);
  const [showBalances, setShowBalances] = useState(true);

  return (
    <section
      style={{
        background: 'var(--ja-card-bg)',
        border: 'var(--ja-card-border)',
        borderRadius: 'var(--ja-card-radius)',
        padding: 'var(--ja-card-padding)',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 12,
        }}
      >
        <h2
          style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}
        >
          Monthly schedule
        </h2>
        <button
          type="button"
          onClick={() => setShowBalances((b) => !b)}
          style={{
            fontSize: 11,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-tertiary)',
            padding: '2px 6px',
          }}
        >
          {showBalances ? 'Hide balance + headroom' : 'Show balance + headroom'}
        </button>
      </header>

      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table
          style={{
            borderCollapse: 'collapse',
            fontSize: 11,
            fontVariantNumeric: 'tabular-nums',
            tableLayout: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          <thead>
            <tr>
              <Th sticky="left" left={0} width={84}>
                Month
              </Th>
              <Th align="right" width={86}>
                Cash need
              </Th>
              <Th align="right" width={86}>
                Cash in
              </Th>
              {sourceIds.map((sourceId) => {
                const s = schedule.sources[sourceId]!;
                const colSpan = showBalances ? 4 : 2;
                return (
                  <th
                    key={sourceId}
                    colSpan={colSpan}
                    style={{
                      ...thBase,
                      textAlign: 'center',
                      borderBottom: '2px solid var(--color-border-hairline)',
                      borderLeft: '2px solid var(--color-border-hairline)',
                      padding: '6px 8px',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {s.sourceName}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 400,
                        color: 'var(--color-text-tertiary)',
                        marginTop: 2,
                      }}
                    >
                      {SOURCE_KIND_LABELS[s.sourceKind] ?? s.sourceKind} · $
                      {(s.limitUsd / 1_000_000).toFixed(1)}M
                      {s.covenantMaxLtcPct != null &&
                        ` · LTC ≤${(s.covenantMaxLtcPct * 100).toFixed(0)}%`}
                      {s.covenantMaxConcurrentProjects != null &&
                        ` · ≤${s.covenantMaxConcurrentProjects} proj`}
                    </div>
                  </th>
                );
              })}
              <Th sticky="right" right={0} width={70}>
                Notes
              </Th>
            </tr>
            <tr>
              <th
                style={{
                  ...thBase,
                  position: 'sticky',
                  left: 0,
                  background: 'var(--ja-card-bg)',
                  zIndex: 2,
                }}
              />
              <th style={thBase} />
              <th style={thBase} />
              {sourceIds.map((sourceId) => (
                <SubHeaders key={sourceId} showBalances={showBalances} />
              ))}
              <th
                style={{
                  ...thBase,
                  position: 'sticky',
                  right: 0,
                  background: 'var(--ja-card-bg)',
                  zIndex: 2,
                }}
              />
            </tr>
          </thead>
          <tbody>
            {schedule.rows.map((row) => {
              const hasBreach = row.notes.length > 0;
              const labelColor = hasBreach
                ? 'var(--color-negative, #b91c1c)'
                : 'var(--color-text-primary)';
              return (
                <tr key={row.month}>
                  <Td sticky="left" left={0} bold>
                    <span style={{ color: labelColor }}>{fmtMonth(row.month)}</span>
                  </Td>
                  <Td align="right">{fmtUsd(row.net_cash_need)}</Td>
                  <Td align="right" muted>
                    {fmtUsd(row.net_cash_in)}
                  </Td>
                  {sourceIds.map((sourceId) => {
                    const slice = row.by_source[sourceId]!;
                    const sourceHasBreach = row.notes.some((n) => n.source_id === sourceId);
                    return (
                      <Slice
                        key={sourceId}
                        drawn={slice.drawn}
                        repaid={slice.repaid}
                        balance={slice.balance_eom}
                        headroom={slice.headroom}
                        showBalances={showBalances}
                        breach={sourceHasBreach}
                      />
                    );
                  })}
                  <Td sticky="right" right={0} align="center">
                    {hasBreach ? (
                      <StatusDot
                        severity="error"
                        title="Covenant breach"
                        message={row.notes.map((n) => `${n.rule}: ${n.formula}`).join(' · ')}
                      />
                    ) : (
                      <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 10, color: 'var(--color-text-tertiary)' }}>
        Drawn = USD drawn from source this month · Repaid = USD paid down · Bal = outstanding at end
        of month · H/r = remaining headroom (limit − balance). Allocation: priority order; KPC LOC
        drawn first when unassigned. Sums match `aggregatePortfolio` per-project totals (golden
        test).
      </p>
    </section>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SubHeaders({ showBalances }: { showBalances: boolean }) {
  return (
    <>
      <th
        style={{
          ...thBase,
          textAlign: 'right',
          borderLeft: '2px solid var(--color-border-hairline)',
          fontSize: 10,
          fontWeight: 400,
          color: 'var(--color-text-tertiary)',
        }}
      >
        Drawn
      </th>
      <th
        style={{
          ...thBase,
          textAlign: 'right',
          fontSize: 10,
          fontWeight: 400,
          color: 'var(--color-text-tertiary)',
        }}
      >
        Repaid
      </th>
      {showBalances && (
        <>
          <th
            style={{
              ...thBase,
              textAlign: 'right',
              fontSize: 10,
              fontWeight: 400,
              color: 'var(--color-text-tertiary)',
            }}
          >
            Bal
          </th>
          <th
            style={{
              ...thBase,
              textAlign: 'right',
              fontSize: 10,
              fontWeight: 400,
              color: 'var(--color-text-tertiary)',
            }}
          >
            H/r
          </th>
        </>
      )}
    </>
  );
}

function Slice({
  drawn,
  repaid,
  balance,
  headroom,
  showBalances,
  breach,
}: {
  drawn: number;
  repaid: number;
  balance: number;
  headroom: number;
  showBalances: boolean;
  breach: boolean;
}) {
  const balanceColor = breach ? 'var(--color-negative, #b91c1c)' : 'var(--color-text-primary)';
  return (
    <>
      <Td align="right" leftBorder>
        {fmtUsd(drawn)}
      </Td>
      <Td align="right" muted>
        {fmtUsd(repaid)}
      </Td>
      {showBalances && (
        <>
          <Td align="right" style={{ color: balanceColor, fontWeight: breach ? 700 : 400 }}>
            {fmtUsd(balance)}
          </Td>
          <Td align="right" muted>
            {fmtUsd(headroom)}
          </Td>
        </>
      )}
    </>
  );
}

// ── Primitives ──────────────────────────────────────────────────────────────

const thBase: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--color-text-tertiary)',
  padding: '6px 8px',
  fontWeight: 700,
  borderBottom: '1px solid var(--color-border-hairline)',
  background: 'var(--ja-card-bg)',
};

function Th({
  children,
  align = 'left',
  sticky,
  left,
  right,
  width,
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  sticky?: 'left' | 'right';
  left?: number;
  right?: number;
  width?: number;
}) {
  const style: React.CSSProperties = {
    ...thBase,
    textAlign: align,
    width,
  };
  if (sticky === 'left') {
    style.position = 'sticky';
    style.left = left;
    style.zIndex = 2;
  }
  if (sticky === 'right') {
    style.position = 'sticky';
    style.right = right;
    style.zIndex = 2;
  }
  return <th style={style}>{children}</th>;
}

function Td({
  children,
  align = 'left',
  sticky,
  left,
  right,
  bold,
  muted,
  leftBorder,
  style: extra,
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  sticky?: 'left' | 'right';
  left?: number;
  right?: number;
  bold?: boolean;
  muted?: boolean;
  leftBorder?: boolean;
  style?: React.CSSProperties;
}) {
  const style: React.CSSProperties = {
    padding: '6px 8px',
    fontSize: 11,
    fontVariantNumeric: 'tabular-nums',
    textAlign: align,
    borderBottom: '1px solid var(--color-border-subtle)',
    color: muted ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
    fontWeight: bold ? 700 : 400,
    background: 'var(--ja-card-bg)',
    ...extra,
  };
  if (sticky === 'left') {
    style.position = 'sticky';
    style.left = left;
    style.zIndex = 1;
  }
  if (sticky === 'right') {
    style.position = 'sticky';
    style.right = right;
    style.zIndex = 1;
  }
  if (leftBorder) {
    style.borderLeft = '2px solid var(--color-border-hairline)';
  }
  return <td style={style}>{children}</td>;
}
