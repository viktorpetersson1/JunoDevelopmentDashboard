'use client';

/**
 * Monthly P&L table (V6.1 T105). Renders below the 9-line P&L hero on the
 * Summary tab. Shows per-month breakdown of every P&L line.
 *
 * Layout:
 *   - Sticky left column: 9 P&L line labels
 *   - Horizontally scrollable month columns (one per YYYY-MM)
 *   - Sticky right column: column totals (= buildProjectPnL totals)
 *   - "Show full model horizon" toggle (defaults off — project window only)
 *
 * Pure presentation: buildProjectPnLMonthly derives from the existing engine
 * output without touching the engine (Hard Rule #2).
 */

import { useState } from 'react';
import { buildProjectPnLMonthly, type MonthlyPnLRow, type ProjectPnL } from '@/lib/finance/project-pnl';
import { projectWindow } from '@/lib/charts/project-window';
import type { ProjectResult } from '@/lib/calc/project/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Compact money formatter for table cells. */
function fmt(usd: number): string {
  if (usd === 0) return '—';
  const abs = Math.abs(usd);
  if (abs >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(usd / 1_000)}k`;
  return `$${Math.round(usd)}`;
}

/** YYYY-MM → "Jan 26" */
function fmtMonth(ym: string): string {
  const parts = ym.split('-');
  const y = parts[0]?.slice(2) ?? '';
  const m = Number(parts[1] ?? 1);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MONTHS[m - 1] ?? ''} '${y}`;
}

// ── P&L line definitions ──────────────────────────────────────────────────────

interface Line {
  label: string;
  field: keyof MonthlyPnLRow;
  kind: 'revenue' | 'cost' | 'subtotal' | 'total';
  totalField: keyof ProjectPnL;
}

function makeLines(taxRatePct: number): Line[] {
  return [
    { label: 'Gross revenue',        field: 'gross_revenue_usd',           kind: 'revenue',  totalField: 'gross_revenue_usd' },
    { label: '− Land',               field: 'land_usd',                    kind: 'cost',     totalField: 'land_usd' },
    { label: '− Hard construction',  field: 'hard_construction_usd',       kind: 'cost',     totalField: 'hard_construction_usd' },
    { label: '− Soft costs',         field: 'soft_costs_usd',              kind: 'cost',     totalField: 'soft_costs_usd' },
    { label: '− Superstructure',     field: 'superstructure_usd',          kind: 'cost',     totalField: 'superstructure_usd' },
    { label: '− Financing cost',     field: 'financing_cost_usd',          kind: 'cost',     totalField: 'financing_cost_usd' },
    { label: 'Net profit before tax',field: 'net_profit_before_tax_usd',   kind: 'subtotal', totalField: 'net_profit_before_tax_usd' },
    { label: `− Tax (${taxRatePct}%)`,field: 'tax_usd',                   kind: 'cost',     totalField: 'tax_usd' },
    { label: 'Net profit after tax', field: 'net_profit_after_tax_usd',    kind: 'total',    totalField: 'net_profit_after_tax_usd' },
  ];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MonthlyPnLTable({
  result,
  pnl,
  taxRatePct,
}: {
  result: ProjectResult;
  pnl: ProjectPnL;
  taxRatePct: number;
}) {
  const [showFull, setShowFull] = useState(false);
  const rows = buildProjectPnLMonthly(result.monthly, { taxRatePct });
  const win  = projectWindow(result.monthly, result.start_date, result.sale_date);
  const visible: MonthlyPnLRow[] = showFull ? rows : rows.slice(win.startIdx, win.endIdx + 1);
  const lines = makeLines(taxRatePct);

  const LABEL_W = 200;
  const COL_W   = 72;
  const TOTAL_W = 88;

  const cellBase: React.CSSProperties = {
    padding: '5px 8px',
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--color-border-subtle)',
  };

  const stickyLeft: React.CSSProperties = {
    ...cellBase,
    textAlign: 'left',
    position: 'sticky',
    left: 0,
    background: 'var(--ja-card-bg)',
    zIndex: 1,
    minWidth: LABEL_W,
    maxWidth: LABEL_W,
    width: LABEL_W,
  };

  const stickyRight: React.CSSProperties = {
    ...cellBase,
    position: 'sticky',
    right: 0,
    background: 'var(--ja-card-bg)',
    zIndex: 1,
    minWidth: TOTAL_W,
    fontWeight: 700,
  };

  return (
    <section
      style={{
        background: 'var(--ja-card-bg)',
        border: 'var(--ja-card-border)',
        borderRadius: 'var(--ja-card-radius)',
        padding: 'var(--ja-card-padding)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <h3
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-text-tertiary)',
            margin: 0,
            fontWeight: 700,
          }}
        >
          Monthly P&amp;L
        </h3>
        <button
          type="button"
          onClick={() => setShowFull((s) => !s)}
          style={{
            fontSize: 11,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-tertiary)',
            padding: '2px 6px',
          }}
        >
          {showFull ? 'Show project window' : 'Show full model horizon'}
        </button>
      </div>

      {/* Scrollable table */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table
          style={{
            borderCollapse: 'collapse',
            width: '100%',
            tableLayout: 'fixed',
          }}
        >
          {/* Column widths */}
          <colgroup>
            <col style={{ width: LABEL_W }} />
            {visible.map((r) => (
              <col key={r.month} style={{ width: COL_W }} />
            ))}
            <col style={{ width: TOTAL_W }} />
          </colgroup>

          {/* Month header row */}
          <thead>
            <tr>
              <th
                style={{
                  ...cellBase,
                  textAlign: 'left',
                  position: 'sticky',
                  left: 0,
                  background: 'var(--ja-card-bg)',
                  zIndex: 2,
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-tertiary)',
                  fontWeight: 700,
                  width: LABEL_W,
                }}
              />
              {visible.map((r) => (
                <th
                  key={r.month}
                  style={{
                    ...cellBase,
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-text-tertiary)',
                    fontWeight: 400,
                    width: COL_W,
                  }}
                >
                  {fmtMonth(r.month)}
                </th>
              ))}
              <th
                style={{
                  ...cellBase,
                  position: 'sticky',
                  right: 0,
                  background: 'var(--ja-card-bg)',
                  zIndex: 2,
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-tertiary)',
                  fontWeight: 700,
                  width: TOTAL_W,
                }}
              >
                Total
              </th>
            </tr>
          </thead>

          {/* P&L rows */}
          <tbody>
            {lines.map((line) => {
              const isEmphatic = line.kind === 'subtotal' || line.kind === 'total';
              const labelColor =
                line.kind === 'cost' ? 'var(--color-text-secondary)' : 'var(--color-text-primary)';
              const rowStyle: React.CSSProperties = {
                fontWeight: isEmphatic ? 700 : 400,
                fontSize: isEmphatic ? 13 : 12,
              };

              return (
                <tr key={line.field} style={rowStyle}>
                  <td style={{ ...stickyLeft, color: labelColor, ...rowStyle }}>{line.label}</td>
                  {visible.map((r) => {
                    const v = r[line.field] as number;
                    return (
                      <td key={r.month} style={{ ...cellBase, ...rowStyle }}>
                        {fmt(v)}
                      </td>
                    );
                  })}
                  <td style={{ ...stickyRight, ...rowStyle }}>
                    {fmt(pnl[line.totalField] as number)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Caption */}
      {!showFull && (
        <p
          style={{
            margin: '10px 0 0',
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
          }}
        >
          {visible.length} of {rows.length} months shown (project window)
        </p>
      )}
    </section>
  );
}
