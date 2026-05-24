/**
 * KpiPattern
 * ----------
 * KPI strip + chart card two-column pattern. The dominant visual motif on
 * the Portfolio Overview and project Summary pages.
 *
 * Layout:
 *   Row 1: KPIStrip with N KPITiles (4–6) spanning full width
 *   Row 2: Two columns — 1.55fr chart card | 1fr summary rail
 *
 * The chart card has a structured header (title + optional actions) and a
 * padded body slot for any chart or data visualisation component. The rail
 * is a free slot — typically a Section with tightly-spaced KPITiles or
 * list rows.
 *
 * Used for:
 *   - Portfolio Overview (IRR / Revenue / Profit / Peak Debt / Peak Equity / MOIC)
 *   - Project Summary (project-level KPIs + cash flow chart)
 *   - Forecast page (portfolio forecast strip + waterfall chart)
 *
 * @example
 * ```tsx
 * <AppShell activeHref="/" scenario={scenario} onScenarioChange={setScenario}>
 *   <KpiPattern
 *     kpis={[
 *       { label: 'Portfolio IRR', value: '38.2%', delta: { value: '+2.1pp', direction: 'up' } },
 *       { label: 'Revenue',       value: '$6.7M',  hint: '2026–2030' },
 *       { label: 'Profit',        value: '$1.1M',  delta: { value: '+15.9%', direction: 'up' } },
 *       { label: 'Peak Debt',     value: '$3.4M',  hint: 'Q4 \'26' },
 *       { label: 'Peak Equity',   value: '$1.9M',  hint: 'LP capital called' },
 *       { label: 'MOIC',          value: '1.58×',  delta: { value: 'vs 1.30× target', direction: 'up' } },
 *     ]}
 *     chartTitle="Cash Flow — 5-Year Projection"
 *     chartActions={<Button variant="ghost" size="sm">Export</Button>}
 *     chart={<CashFlowChart />}
 *     rail={
 *       <Section title="Active projects">
 *         <ProjectCard />
 *       </Section>
 *     }
 *   />
 * </AppShell>
 * ```
 *
 * @module patterns/KpiPattern
 */

import React, { type ReactNode } from 'react';
import { KPIStrip, KPITile } from '../components/data';
import type { KPITileProps } from '../components/data';
import './patterns.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KpiPatternProps {
  /**
   * Array of KPITile props — rendered inside a KPIStrip.
   * Accepts 3–6 items; strip automatically adjusts columns.
   */
  kpis: KPITileProps[];
  /**
   * Chart or data visualisation to render in the main card body.
   * Typically a Recharts / Chart.js / D3 component.
   */
  chart: ReactNode;
  /** Optional heading for the chart card */
  chartTitle?: string;
  /** Optional actions slot in the chart card header (e.g. time-range buttons) */
  chartActions?: ReactNode;
  /** Right rail content — typically a Section with sub-KPIs or a list */
  rail?: ReactNode;
  /** Optional CSS class appended to the root element */
  className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Clamp KPI count to valid column range (3–6) */
function getColumns(count: number): 3 | 4 | 5 | 6 {
  if (count <= 3) return 3;
  if (count >= 6) return 6;
  return count as 3 | 4 | 5 | 6;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * KPI strip + chart card + summary rail — the canonical portfolio/project
 * dashboard motif.
 *
 * Pass `kpis`, a `chart` node, and an optional `rail` to build the full
 * dashboard section without any additional boilerplate.
 */
export function KpiPattern({
  kpis,
  chart,
  chartTitle,
  chartActions,
  rail,
  className,
}: KpiPatternProps) {
  const rootClass = ['ja-kpi-pattern', className].filter(Boolean).join(' ');
  const colCount = getColumns(kpis.length);

  return (
    <div className={rootClass}>
      {/* ── KPI strip ───────────────────────────────── */}
      <div className="ja-kpi-pattern__strip">
        <KPIStrip columns={colCount}>
          {kpis.map((kpi, i) => (
            <KPITile key={`${kpi.label}-${i}`} {...kpi} />
          ))}
        </KPIStrip>
      </div>

      {/* ── Two-column body: chart | rail ───────────── */}
      <div className="ja-kpi-pattern__body">
        {/* Chart card */}
        <div className="ja-kpi-pattern__chart-card">
          {/* Card header — only rendered when title or actions are present */}
          {(chartTitle || chartActions) && (
            <div className="ja-kpi-pattern__chart-header">
              {chartTitle && <h2 className="ja-kpi-pattern__chart-title">{chartTitle}</h2>}
              {chartActions && (
                <div className="ja-kpi-pattern__chart-actions" aria-label="Chart actions">
                  {chartActions}
                </div>
              )}
            </div>
          )}

          {/* Chart body */}
          <div className="ja-kpi-pattern__chart-body" aria-label={chartTitle ?? 'Chart'}>
            {chart}
          </div>
        </div>

        {/* Summary rail */}
        {rail && (
          <aside className="ja-kpi-pattern__rail" aria-label="Summary">
            {rail}
          </aside>
        )}
      </div>
    </div>
  );
}

export default KpiPattern;
