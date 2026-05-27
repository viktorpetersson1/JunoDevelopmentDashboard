/**
 * V4.6 — /sensitivity (INVENTORY §20 Sensitivity tornado).
 *
 * One-at-a-time sensitivity analysis on portfolio profit-before-tax.
 * 4 drivers (sale price, build cost, interest rate, timing) each
 * perturbed in both directions; results plotted as a horizontal
 * tornado chart sorted by magnitude.
 *
 * Calc: lib/calc/sensitivity/tornado — pure function, 9 aggregator
 * calls per page load. Heatmap from INVENTORY §20 deferred to V4.6b
 * (the lazy "Compute heatmap" button it specs needs client state
 * we don't want to bake into the first cut).
 */

import { DashboardShell } from '../_components/dashboard-shell';
import { TornadoChart } from './_components/tornado-chart';
import { findManyProjects } from '@/lib/repos/project';
import { runSensitivityTornado } from '@/lib/calc/sensitivity/tornado';
import { BASELINE_GLOBALS, BASELINE_SCENARIO } from '@/lib/calc/baselines';
import { formatMoney } from '@/lib/utils/money';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export default async function SensitivityPage() {
  const { profile, user } = await requireAuthOrRedirect('/sensitivity');
  const { projects } = await findManyProjects({ limit: 100 });
  const report = runSensitivityTornado(projects, BASELINE_GLOBALS, BASELINE_SCENARIO);

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  const biggestMover = report.drivers[0];

  return (
    <DashboardShell activeHref="/sensitivity" user={dashboardUser}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <header>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0, color: 'var(--color-text-primary)' }}>
            Sensitivity
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            How portfolio profit-before-tax moves when each input is perturbed one at a time.
            Bars sorted by magnitude — biggest mover on top.
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
              hint={`±${formatMoney(biggestMover.span * 100 / 2, { compact: true, precision: 2 })} swing`}
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
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
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
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
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
                      color: d.lowDelta < 0 ? 'var(--color-negative, #dc2626)' : 'var(--color-positive, #15803d)',
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
                      color: d.highDelta < 0 ? 'var(--color-negative, #dc2626)' : 'var(--color-positive, #15803d)',
                    }}
                  >
                    {formatMoney(d.highDelta * 100, { compact: true, precision: 2 })}
                  </td>
                  <td style={td('right')}>{formatMoney(d.span * 100, { compact: true, precision: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section
          style={{
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border-hairline)',
            borderRadius: 14,
            padding: 20,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Heatmap (coming in V4.6b)
          </h2>
          <p style={{ margin: '6px 0 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            The two-driver heatmap (build cost × × sale price ×, profit per cell) ships in a follow-up
            commit. The current OAT tornado already covers the headline question of which single driver
            moves profit most.
          </p>
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
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          marginTop: 6,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>{hint}</div>
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
    fontWeight: 600,
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
