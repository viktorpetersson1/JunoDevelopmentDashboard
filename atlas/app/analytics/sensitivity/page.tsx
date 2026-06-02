/**
 * V4.6 — /sensitivity (INVENTORY §20 Sensitivity tornado).
 *
 * One-at-a-time sensitivity analysis on portfolio profit-before-tax.
 * 4 drivers (sale price, build cost, interest rate, timing) each
 * perturbed in both directions; results plotted as a horizontal
 * tornado chart sorted by magnitude.
 *
 * Calc:
 *   - lib/calc/sensitivity/tornado — OAT sweep, 9 aggregator calls
 *   - lib/calc/sensitivity/heatmap — 6×6 cross-driver grid, 36 calls
 *
 * Total server-side compute on a ~6-project portfolio: well under
 * 100ms. Both runs happen on every page load; no lazy-load buttons.
 */

import { DashboardShell } from '../../_components/dashboard-shell';
import { AnalyticsTabs } from '../../_components/analytics-tabs';
import { TornadoChart } from './_components/tornado-chart';
import { HeatmapGrid } from './_components/heatmap-grid';
import { findManyProjects } from '@/lib/repos/project';
import { runSensitivityTornado } from '@/lib/calc/sensitivity/tornado';
import { runHeatmap } from '@/lib/calc/sensitivity/heatmap';
import { BASELINE_SCENARIO } from '@/lib/calc/baselines';
import { getActiveGlobals } from '@/lib/globals/active';
import { formatMoney } from '@/lib/utils/money';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export default async function SensitivityPage() {
  const { profile, user } = await requireAuthOrRedirect('/analytics/sensitivity');
  const { projects } = await findManyProjects({ limit: 100 });
  const globalsCtx = await getActiveGlobals();
  // Tornado intentionally anchors at the BASE scenario (not the active
  // scenario) so the deltas are interpretable. Active globals DO flow
  // through so org-wide overrides change the reference profit + perturbation
  // magnitudes consistently.
  const report = runSensitivityTornado(projects, globalsCtx.globals, BASELINE_SCENARIO);
  // V4.6b — heatmap (6×6 grid, 36 aggregator runs ≈ 30-60ms server-side).
  const heatmap = runHeatmap(projects, globalsCtx.globals, BASELINE_SCENARIO);

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  const biggestMover = report.drivers[0];

  return (
    <DashboardShell activeHref="/analytics" user={dashboardUser}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <AnalyticsTabs activeKey="sensitivity" />
        <header>
          <h1
            style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}
          >
            Sensitivity
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            How portfolio profit-before-tax moves when each input is perturbed one at a time. Bars
            sorted by magnitude — biggest mover on top.
          </p>
        </header>

        {/* Headline KPIs */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <KpiTile
            label="Base case profit (pre-tax)"
            value={formatMoney(report.basePbt * 100, { compact: true, precision: 2 })}
            hint="Center of the tornado"
          />
          {biggestMover && (
            <KpiTile
              label="Biggest mover"
              value={biggestMover.label}
              hint={`±${formatMoney((biggestMover.span * 100) / 2, { compact: true, precision: 2 })} swing`}
            />
          )}
          <KpiTile
            label="Drivers tested"
            value={String(report.drivers.length)}
            hint="OAT — one-at-a-time sweep"
          />
        </section>

        {/* Tornado */}
        <section
          style={{
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border-hairline)',
            borderRadius: 14,
            padding: 20,
          }}
        >
          <header style={{ marginBottom: 12 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--color-text-primary)',
              }}
            >
              Profit swing per driver
            </h2>
            <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              Left bar = downside case; right bar = upside case. Bar width = profit Δ vs base (USD).
            </p>
          </header>
          <TornadoChart drivers={report.drivers} />
        </section>

        {/* Driver detail table */}
        <section
          style={{
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border-hairline)',
            borderRadius: 14,
            padding: 20,
          }}
        >
          <header style={{ marginBottom: 12 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--color-text-primary)',
              }}
            >
              Driver breakdown
            </h2>
            <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              Exact deltas per perturbation. Sorted by absolute span (biggest mover first).
            </p>
          </header>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
                <th style={th()}>Driver</th>
                <th style={th()}>Low case</th>
                <th style={th('right')}>Δ profit (low)</th>
                <th style={th()}>High case</th>
                <th style={th('right')}>Δ profit (high)</th>
                <th style={th('right')}>Span</th>
              </tr>
            </thead>
            <tbody>
              {report.drivers.map((d) => (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
                  <td style={td()}>{d.label}</td>
                  <td style={td()}>
                    <code style={chip()}>{d.lowLabel}</code>
                  </td>
                  <td
                    style={{
                      ...td('right'),
                      color:
                        d.lowDelta < 0
                          ? 'var(--color-negative, #dc2626)'
                          : 'var(--color-positive, #15803d)',
                    }}
                  >
                    {formatMoney(d.lowDelta * 100, { compact: true, precision: 2 })}
                  </td>
                  <td style={td()}>
                    <code style={chip()}>{d.highLabel}</code>
                  </td>
                  <td
                    style={{
                      ...td('right'),
                      color:
                        d.highDelta < 0
                          ? 'var(--color-negative, #dc2626)'
                          : 'var(--color-positive, #15803d)',
                    }}
                  >
                    {formatMoney(d.highDelta * 100, { compact: true, precision: 2 })}
                  </td>
                  <td style={td('right')}>
                    {formatMoney(d.span * 100, { compact: true, precision: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* V4.6b — two-driver heatmap */}
        <section
          style={{
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border-hairline)',
            borderRadius: 14,
            padding: 20,
          }}
        >
          <header style={{ marginBottom: 12 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--color-text-primary)',
              }}
            >
              Two-driver heatmap
            </h2>
            <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              Build cost × × sale price × — each cell is portfolio profit (pre-tax) at that
              combination. Base case (×1.0, ×1.0) outlined. Color: red worst → green best across the
              grid.
            </p>
          </header>
          <HeatmapGrid report={heatmap} />
        </section>
      </div>
    </DashboardShell>
  );
}

function KpiTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-tertiary)',
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          marginTop: 6,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function chip(): React.CSSProperties {
  return {
    background: 'var(--color-surface-sunken, #f7f7f7)',
    padding: '2px 8px',
    borderRadius: 6,
    fontSize: 12,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    color: 'var(--color-text-primary)',
  };
}

function th(align: 'left' | 'right' = 'left'): React.CSSProperties {
  return {
    textAlign: align,
    padding: '8px 0',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)',
  };
}

function td(align: 'left' | 'right' = 'left'): React.CSSProperties {
  return {
    textAlign: align,
    padding: '10px 8px 10px 0',
    fontVariantNumeric: align === 'right' ? 'tabular-nums' : 'normal',
    color: 'var(--color-text-primary)',
  };
}
