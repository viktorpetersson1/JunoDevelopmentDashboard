/**
 * Project Detail — Summary tab (V5.2 T093.2 redesign).
 *
 * Server-renderable (no client state — the owner-earnings disclosure uses a
 * native <details>). Replaces the old 6-KPI strip + Sources/Uses tables with:
 *
 *   1. HERO P&L — the canonical 9-line P&L (lib/finance/project-pnl.ts) with a
 *      PLANNED column and an ACTUAL-TO-DATE column (— until cost entries land),
 *      plus a thin Margin / IRR / MOIC row.
 *   2. OWNER EARNINGS — NPAT split by cap-table share (admin-only; collapsed).
 *   3. PROJECT CASH FLOW — existing chart (T094 redoes it).
 *   4. SCHEDULE — start / sale.
 *
 * Closing costs render as a MEMO line that does NOT reduce NPBT/NPAT (D-030).
 */

import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { formatMoney } from '@/lib/utils/money';
import type { ProjectResult } from '@/lib/calc/project/types';
import type { ProjectPnL, OwnerEarningRow } from '@/lib/finance/project-pnl';
import type { RolloutTriggerResult, RolloutState } from '@/lib/finance/rollout-trigger';
import type { DebtSnapshot } from '@/lib/finance/project-cashflow';
import { CashFlowChart } from './cash-flow-chart';
import { Section } from '@/app/_components/section';

// T103.5/.9 — canonical card tokens (white-on-grey-on-white pattern).
const card: CSSProperties = {
  background: 'var(--ja-card-bg)',
  border: 'var(--ja-card-border)',
  borderRadius: 'var(--ja-card-radius)',
  padding: 'var(--ja-card-padding)',
};

const sectionLabel: CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--color-text-tertiary)',
  margin: 0,
  marginBottom: 16,
};

const money = (usd: number) => formatMoney(usd * 100, { compact: true, precision: 2 });

export function SummaryTab({
  result,
  pnl,
  ownerEarnings,
  rollout,
  debtSnapshot,
}: {
  result: ProjectResult;
  pnl: ProjectPnL;
  /** null = the viewing role can't see the per-owner split. */
  ownerEarnings: OwnerEarningRow[] | null;
  rollout: RolloutTriggerResult;
  debtSnapshot: DebtSnapshot;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ja-section-gap)' }}>
      <PnlHero pnl={pnl} />
      <RolloutPacing rollout={rollout} />
      {ownerEarnings && <OwnerEarnings rows={ownerEarnings} npat={pnl.net_profit_after_tax_usd} />}
      <CashFlowChart monthly={result.monthly} />
      <Section
        label="Project status"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 'var(--ja-card-gap)',
        }}
      >
        <WhatWeOweToday snapshot={debtSnapshot} />
        <ScheduleCard result={result} />
      </Section>
    </div>
  );
}

// ── What we owe today (T094.2) ──────────────────────────────────────────────

function WhatWeOweToday({ snapshot }: { snapshot: DebtSnapshot }) {
  return (
    <section style={card}>
      <h3 style={sectionLabel}>What we owe today</h3>
      <Row label="Project debt outstanding" value={money(snapshot.debt_outstanding)} bold />
      <Row label="Interest (this month)" value={money(snapshot.interest_this_month)} />
      {snapshot.is_forecast && (
        <p
          style={{
            margin: '12px 0 0',
            fontSize: 12,
            fontStyle: 'italic',
            color: 'var(--color-text-tertiary)',
          }}
        >
          Forecast — no actuals logged for {snapshot.month}. The engine has a single debt stream, so
          the KPC LOC / lender split is not broken out yet.
        </p>
      )}
    </section>
  );
}

// ── Hero P&L ────────────────────────────────────────────────────────────────

interface PnlLine {
  label: string;
  usd: number;
  kind: 'revenue' | 'cost' | 'subtotal' | 'total';
}

function PnlHero({ pnl }: { pnl: ProjectPnL }) {
  const lines: PnlLine[] = [
    { label: 'Gross revenue', usd: pnl.gross_revenue_usd, kind: 'revenue' },
    { label: '− Land', usd: pnl.land_usd, kind: 'cost' },
    { label: '− Hard construction', usd: pnl.hard_construction_usd, kind: 'cost' },
    { label: '− Soft costs', usd: pnl.soft_costs_usd, kind: 'cost' },
    { label: '− Superstructure', usd: pnl.superstructure_usd, kind: 'cost' },
    { label: '− Financing cost', usd: pnl.financing_cost_usd, kind: 'cost' },
    { label: 'Net profit before tax', usd: pnl.net_profit_before_tax_usd, kind: 'subtotal' },
    { label: `− Tax (${pnl.tax_rate_pct}%)`, usd: pnl.tax_usd, kind: 'cost' },
    { label: 'Net profit after tax', usd: pnl.net_profit_after_tax_usd, kind: 'total' },
  ];

  return (
    <section style={card}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto',
          columnGap: 32,
          alignItems: 'baseline',
        }}
      >
        <div />
        <ColHead>Planned</ColHead>
        <ColHead>Actual to date</ColHead>

        {lines.map((line) => (
          <PnlRow key={line.label} line={line} />
        ))}
      </div>

      {/* Closing costs — MEMO only; not deducted from profit (D-030). */}
      {pnl.closing_costs_memo_usd > 0 && (
        <p
          style={{
            margin: '12px 0 0',
            fontSize: 12,
            color: 'var(--color-text-tertiary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          Closing costs {money(pnl.closing_costs_memo_usd)} (memo — informational; not yet modelled
          in profit)
        </p>
      )}

      <div
        style={{
          display: 'flex',
          gap: 24,
          marginTop: 20,
          paddingTop: 16,
          borderTop: '1px solid var(--color-border-subtle)',
          fontSize: 13,
          color: 'var(--color-text-secondary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <Metric label="Margin" value={`${(pnl.npat_margin_pct * 100).toFixed(1)}%`} />
        <Metric
          label="IRR"
          value={pnl.irr_annual !== null ? `${(pnl.irr_annual * 100).toFixed(1)}%` : '—'}
        />
        <Metric label="MOIC" value={`${pnl.moic.toFixed(2)}×`} />
      </div>
    </section>
  );
}

function ColHead({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--color-text-tertiary)',
        textAlign: 'right',
        paddingBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function PnlRow({ line }: { line: PnlLine }) {
  const emphatic = line.kind === 'subtotal' || line.kind === 'total';
  const isTotal = line.kind === 'total';
  const labelColor =
    line.kind === 'cost' ? 'var(--color-text-secondary)' : 'var(--color-text-primary)';
  const rowStyle: CSSProperties = {
    fontSize: isTotal ? 16 : 14,
    fontWeight: emphatic ? 700 : 400,
    padding: '7px 0',
    fontVariantNumeric: 'tabular-nums',
    ...(emphatic
      ? { borderTop: '1px solid var(--color-border-subtle)', marginTop: 2, paddingTop: 9 }
      : {}),
  };
  return (
    <>
      <div style={{ ...rowStyle, color: labelColor }}>{line.label}</div>
      <div style={{ ...rowStyle, textAlign: 'right', color: 'var(--color-text-primary)' }}>
        {money(line.usd)}
      </div>
      <div style={{ ...rowStyle, textAlign: 'right', color: 'var(--color-text-tertiary)' }}>—</div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span style={{ color: 'var(--color-text-tertiary)' }}>{label} </span>
      <span style={{ color: 'var(--color-text-primary)', fontWeight: 700 }}>{value}</span>
    </span>
  );
}

// ── Rollout pacing ──────────────────────────────────────────────────────────

const ROLLOUT_ACCENT: Record<RolloutState, string> = {
  unconfigured: 'var(--color-border-strong)',
  green: '#15803d',
  amber: '#a16207',
  red: '#b91c1c',
  overdue: '#b91c1c',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtMonth(ym: string): string {
  const parts = ym.split('-');
  const y = parts[0] ?? ym;
  const m = Number(parts[1] ?? '1');
  return `${MONTHS[m - 1] ?? ''} ${y}`.trim();
}

/** Rollout Profitability Trigger block (T093.7). Clicking → /pipeline, where a
 *  prospect gets advanced. Shows a "set target" prompt while unconfigured. */
function RolloutPacing({ rollout }: { rollout: RolloutTriggerResult }) {
  const accent = ROLLOUT_ACCENT[rollout.state];
  const configured = rollout.state !== 'unconfigured';
  const headline = !configured
    ? 'Set an annual NPAT target to enable rollout pacing'
    : rollout.next_start_required_by
      ? `Next start needed by ${fmtMonth(rollout.next_start_required_by)}`
      : 'On pace — no new start required in the next 3 years';

  return (
    <Link href="/pipeline" style={{ textDecoration: 'none', color: 'inherit' }}>
      <section style={{ ...card, borderLeft: `3px solid ${accent}` }} title={rollout.rationale}>
        <div
          style={{
            ...sectionLabel,
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: accent,
              display: 'inline-block',
            }}
          />
          Rollout pacing
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            color: configured ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
          }}
        >
          {headline}
        </p>
        {configured ? (
          <p
            style={{
              margin: '8px 0 0',
              fontSize: 13,
              color: 'var(--color-text-secondary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {rollout.required_annual_npat_usd != null && (
              <>Target {money(rollout.required_annual_npat_usd)}/yr&nbsp;·&nbsp;</>
            )}
            Trailing 12mo {money(rollout.current_trailing_12mo_npat_usd)}
          </p>
        ) : (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Settings → General → Rollout target
          </p>
        )}
      </section>
    </Link>
  );
}

// ── Owner earnings (admin-only, collapsed) ──────────────────────────────────

function OwnerEarnings({ rows, npat }: { rows: OwnerEarningRow[]; npat: number }) {
  const totalBps = rows.reduce((s, r) => s + r.shareBps, 0);
  return (
    <details style={card}>
      <summary
        style={{
          cursor: 'pointer',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-text-tertiary)',
          listStyle: 'none',
        }}
      >
        Owner earnings · {money(npat)} NPAT
      </summary>
      <div style={{ marginTop: 16 }}>
        {rows.map((r) => (
          <Row
            key={r.key}
            label={`${r.displayName} · ${(r.shareBps / 100).toFixed(1)}%`}
            value={money(r.earnings_usd)}
          />
        ))}
        <Row label={`Total · ${(totalBps / 100).toFixed(1)}%`} value={money(npat)} bold />
      </div>
    </details>
  );
}

// ── Schedule ────────────────────────────────────────────────────────────────

function ScheduleCard({ result }: { result: ProjectResult }) {
  return (
    <aside style={card}>
      <h3 style={sectionLabel}>Schedule</h3>
      <Row label="Start" value={result.start_date ?? '—'} />
      <Row label="Sale" value={result.sale_date ?? '—'} />
    </aside>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
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
          fontWeight: bold ? 700 : 400,
          color: 'var(--color-text-primary)',
        }}
      >
        {value}
      </span>
    </div>
  );
}
