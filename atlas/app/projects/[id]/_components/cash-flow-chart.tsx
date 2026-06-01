'use client';

/**
 * T094.1 — Project cash-flow chart: FLOWS, not balances.
 *
 * Recharts composed chart over the derived flow series
 * (lib/finance/project-cashflow.ts):
 *   - Stacked inflow bars (positive): Debt draws, Sale proceeds
 *   - Stacked outflow bars (negative): Land, Construction, Soft, Financing,
 *     Debt repaid
 *   - Cumulative-net line (running inflows − outflows)
 *
 * The equity series are gone — Juno is debt-funded, so the old
 * Net-cash/Debt-balance/Equity-balance view was the wrong shape (V5.2 §2.1).
 * Pure presentation; client because recharts needs ResizeObserver.
 */

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MonthlySeries } from '@/lib/calc/project/types';
import { buildProjectCashFlow } from '@/lib/finance/project-cashflow';

interface ChartRow {
  date: string;
  debtDraws: number;
  sales: number;
  // Outflows are negated so the bars render below the zero line.
  land: number;
  construction: number;
  soft: number;
  financing: number;
  debtRepaid: number;
  cumulative: number;
}

function buildRows(monthly: MonthlySeries): ChartRow[] {
  return buildProjectCashFlow(monthly).map((r) => ({
    date: r.month,
    debtDraws: r.debt_draws,
    sales: r.sale_proceeds,
    land: -r.land,
    construction: -r.construction,
    soft: -r.soft,
    financing: -r.financing,
    debtRepaid: -r.debt_repaid,
    cumulative: r.cumulative_net,
  }));
}

const compact = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
};

const tickMonth = (ym: string): string => (ym.endsWith('-01') ? ym.slice(0, 4) : '');

export function CashFlowChart({ monthly }: { monthly: MonthlySeries }) {
  const data = buildRows(monthly);
  return (
    <section
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 14,
        padding: 24,
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
          style={{ fontSize: 16, fontWeight: 600, margin: 0, color: 'var(--color-text-primary)' }}
        >
          Cash flow
        </h2>
        <span
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-text-tertiary)',
          }}
        >
          monthly flows · {data.length} months
        </span>
      </header>
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--color-border-subtle)" />
            <XAxis
              dataKey="date"
              tickFormatter={tickMonth}
              tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
              stroke="var(--color-border-hairline)"
            />
            <YAxis
              tickFormatter={compact}
              tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
              stroke="var(--color-border-hairline)"
              width={56}
            />
            <Tooltip
              formatter={(v: number | string) =>
                typeof v === 'number' ? compact(Math.abs(v)) : String(v)
              }
              labelStyle={{ color: 'var(--color-text-primary)', fontSize: 12 }}
              contentStyle={{
                background: 'var(--color-surface-base)',
                border: '1px solid var(--color-border-hairline)',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            <ReferenceLine y={0} stroke="var(--color-border-strong)" strokeWidth={1} />
            {/* Inflows */}
            <Bar dataKey="debtDraws" name="Debt draws" stackId="in" fill="#0d9488" />
            <Bar dataKey="sales" name="Sale proceeds" stackId="in" fill="#15803d" />
            {/* Outflows (negated) */}
            <Bar dataKey="land" name="Land" stackId="out" fill="#78716c" />
            <Bar dataKey="construction" name="Construction" stackId="out" fill="#d97706" />
            <Bar dataKey="soft" name="Soft costs" stackId="out" fill="#9ca3af" />
            <Bar dataKey="financing" name="Financing" stackId="out" fill="#b91c1c" />
            <Bar dataKey="debtRepaid" name="Debt repaid" stackId="out" fill="#64748b" />
            <Line
              type="monotone"
              dataKey="cumulative"
              name="Cumulative net"
              stroke="#0d0d0d"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
