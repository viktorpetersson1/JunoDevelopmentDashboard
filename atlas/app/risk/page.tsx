/**
 * V4.7 — /risk (INVENTORY §22 Stress test / Monte Carlo).
 *
 * Note the path: `/risk` (singular) is the stress-test view per
 * INVENTORY's `view_key: risk`; `/risks` (plural) is the qualitative
 * Risks Center (V4.3). Same root word, different surfaces.
 *
 * V4.7 + V4.7b scope:
 *   ✓ Server-side Monte Carlo on every page load (200 trials default,
 *     reproducible via seeded RNG so the page is byte-stable on refresh)
 *   ✓ Editable driver distributions (triangular min/mode/max inputs)
 *     and trials count via URL searchParams — bookmarkable/shareable
 *   ✓ "Run simulation" button submits a GET form → page re-renders
 *   ✓ "Reset to defaults" link clears query
 *   ✓ KPI strip (trials / median profit / P10 / P(loss))
 *   ✓ Quick interpretation panel
 *   ✓ Outcome percentiles table (7 outcomes × 9 percentile cols)
 *   ✓ Profit distribution histogram
 *   ✓ Peak equity distribution histogram
 *
 * Deferred to V4.7c:
 *   - Worker-based async run for >500 trials (current ceiling)
 *   - Distribution param persistence (atlas.risk_configs table)
 */

import { DashboardShell } from '../_components/dashboard-shell';
import { DistributionChart } from './_components/distribution-chart';
import { DriverControls } from './_components/driver-controls';
import { findManyProjects } from '@/lib/repos/project';
import {
  runMonteCarlo,
  DEFAULT_DISTRIBUTIONS,
  type MonteCarloDistributions,
} from '@/lib/calc/risk/monte-carlo';
import { BASELINE_SCENARIO } from '@/lib/calc/baselines';
import { getActiveGlobals } from '@/lib/globals/active';
import { formatMoney } from '@/lib/utils/money';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

const DEFAULT_TRIALS = 200;

/** Parse a single numeric searchParam with a fallback. Tolerates invalid
 *  input (returns the fallback) so a malformed URL never 500s the page. */
function parseNum(raw: string | string[] | undefined, fallback: number): number {
  if (raw == null) return fallback;
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (s == null) return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

/** Build distributions from searchParams, falling back per-field to
 *  DEFAULT_DISTRIBUTIONS. Returns { dists, isDefault } so the page can
 *  hint "you're looking at defaults" vs "you customized this". */
function buildDistributions(searchParams: Record<string, string | string[] | undefined>): {
  dists: MonteCarloDistributions;
  isDefault: boolean;
} {
  const d = DEFAULT_DISTRIBUTIONS;
  const dists: MonteCarloDistributions = {
    sale_price_multiplier: {
      min: parseNum(searchParams.sale_min, d.sale_price_multiplier.min),
      mode: parseNum(searchParams.sale_mode, d.sale_price_multiplier.mode),
      max: parseNum(searchParams.sale_max, d.sale_price_multiplier.max),
    },
    build_cost_multiplier: {
      min: parseNum(searchParams.build_min, d.build_cost_multiplier.min),
      mode: parseNum(searchParams.build_mode, d.build_cost_multiplier.mode),
      max: parseNum(searchParams.build_max, d.build_cost_multiplier.max),
    },
    interest_rate_delta_bps: {
      min: parseNum(searchParams.rate_min, d.interest_rate_delta_bps.min),
      mode: parseNum(searchParams.rate_mode, d.interest_rate_delta_bps.mode),
      max: parseNum(searchParams.rate_max, d.interest_rate_delta_bps.max),
    },
    timing_shift_months: {
      min: parseNum(searchParams.timing_min, d.timing_shift_months.min),
      mode: parseNum(searchParams.timing_mode, d.timing_shift_months.mode),
      max: parseNum(searchParams.timing_max, d.timing_shift_months.max),
    },
  };
  // "Default" = every value matches the canned defaults — used to render
  // the "showing defaults" indicator on the controls panel.
  const isDefault =
    dists.sale_price_multiplier.min === d.sale_price_multiplier.min &&
    dists.sale_price_multiplier.mode === d.sale_price_multiplier.mode &&
    dists.sale_price_multiplier.max === d.sale_price_multiplier.max &&
    dists.build_cost_multiplier.min === d.build_cost_multiplier.min &&
    dists.build_cost_multiplier.mode === d.build_cost_multiplier.mode &&
    dists.build_cost_multiplier.max === d.build_cost_multiplier.max &&
    dists.interest_rate_delta_bps.min === d.interest_rate_delta_bps.min &&
    dists.interest_rate_delta_bps.mode === d.interest_rate_delta_bps.mode &&
    dists.interest_rate_delta_bps.max === d.interest_rate_delta_bps.max &&
    dists.timing_shift_months.min === d.timing_shift_months.min &&
    dists.timing_shift_months.mode === d.timing_shift_months.mode &&
    dists.timing_shift_months.max === d.timing_shift_months.max;
  return { dists, isDefault };
}

export default async function RiskPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { profile, user } = await requireAuthOrRedirect('/risk');
  const { projects } = await findManyProjects({ limit: 100 });
  const globalsCtx = await getActiveGlobals();

  // V4.7b — pull custom distributions + trials from URL; defaults when absent.
  const trials = Math.min(Math.max(parseNum(searchParams.trials, DEFAULT_TRIALS), 100), 500);
  const { dists, isDefault } = buildDistributions(searchParams);

  // Seeded run so refresh shows the same percentiles — important for
  // diligence (a board paper citing P10 should match on re-open).
  // MC perturbs around BASE scenario (not active) so the trial envelope
  // semantics are stable; active globals flow through normally.
  const t0 = Date.now();
  const report = runMonteCarlo(projects, globalsCtx.globals, BASELINE_SCENARIO, {
    trials,
    distributions: dists,
    seed: 0xc0ffee,
  });
  const tookMs = Date.now() - t0;

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  const profitRow = report.percentiles.find((r) => r.outcome === 'profit_before_tax');
  const median = profitRow?.p50 ?? 0;
  const p10 = profitRow?.p10 ?? 0;
  const lossProb = profitRow?.p_loss ?? 0;

  const profitOutcomes = report.outcomes.map((o) => o.profit_before_tax);
  const equityOutcomes = report.outcomes.map((o) => o.peak_equity);

  return (
    <DashboardShell activeHref="/risk" user={dashboardUser}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <header>
          <h1
            style={{ fontSize: 24, fontWeight: 600, margin: 0, color: 'var(--color-text-primary)' }}
          >
            Stress test
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Monte Carlo across all four scenario drivers — triangular distributions per INVENTORY
            §22. Re-runs on every page load; seeded so the same trials reproduce.
          </p>
        </header>

        {/* KPI strip — post-sim per INVENTORY §22 */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
          }}
        >
          <KpiTile label="Trials" value={String(report.trials)} hint={`${tookMs} ms`} />
          <KpiTile
            label="Median profit (P50)"
            value={formatMoney(median * 100, { compact: true, precision: 2 })}
          />
          <KpiTile
            label="P10 profit (downside)"
            value={formatMoney(p10 * 100, { compact: true, precision: 2 })}
            tone={p10 < 0 ? 'negative' : 'neutral'}
          />
          <KpiTile
            label="P(loss)"
            value={`${(lossProb * 100).toFixed(1)}%`}
            tone={lossProb > 0.05 ? 'negative' : 'neutral'}
            hint={
              lossProb === 0
                ? 'no losing trials'
                : `${Math.round(lossProb * report.trials)} of ${report.trials} trials`
            }
          />
        </section>

        {/* Quick interpretation */}
        <Section title="Quick interpretation" subtitle="Plain-English summary of the simulation">
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 13,
              color: 'var(--color-text-primary)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <li>
              Across {report.trials} trials, the median portfolio profit (pre-tax) lands at{' '}
              <strong>{formatMoney(median * 100, { compact: true, precision: 2 })}</strong>.
            </li>
            <li>
              The downside case (P10 — i.e. only 10% of trials are worse) returns{' '}
              <strong style={{ color: p10 < 0 ? 'var(--color-negative, #dc2626)' : 'inherit' }}>
                {formatMoney(p10 * 100, { compact: true, precision: 2 })}
              </strong>
              .
            </li>
            <li>
              {lossProb === 0
                ? 'No trials produce a loss — the model is robust to the configured downside envelope.'
                : `${(lossProb * 100).toFixed(1)}% of trials produce a loss — the model is exposed to the configured downside envelope.`}
            </li>
            <li style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
              Driver envelopes: sale ×[{DEFAULT_DISTRIBUTIONS.sale_price_multiplier.min},{' '}
              {DEFAULT_DISTRIBUTIONS.sale_price_multiplier.max}], build ×[
              {DEFAULT_DISTRIBUTIONS.build_cost_multiplier.min},{' '}
              {DEFAULT_DISTRIBUTIONS.build_cost_multiplier.max}], rate ±
              {Math.max(
                Math.abs(DEFAULT_DISTRIBUTIONS.interest_rate_delta_bps.min),
                Math.abs(DEFAULT_DISTRIBUTIONS.interest_rate_delta_bps.max)
              )}
              bps, timing {DEFAULT_DISTRIBUTIONS.timing_shift_months.min}—
              {DEFAULT_DISTRIBUTIONS.timing_shift_months.max} mo. Triangular distribution with mode
              at base.
            </li>
          </ul>
        </Section>

        {/* Percentiles */}
        <Section
          title="Outcome percentiles"
          subtitle="9 percentiles + mean + P(loss) per simulated outcome"
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
                  <th style={th()}>Outcome</th>
                  <th style={th('right')}>Min</th>
                  <th style={th('right')}>P10</th>
                  <th style={th('right')}>P25</th>
                  <th style={th('right')}>P50</th>
                  <th style={th('right')}>Mean</th>
                  <th style={th('right')}>P75</th>
                  <th style={th('right')}>P90</th>
                  <th style={th('right')}>Max</th>
                  <th style={th('right')}>P(loss)</th>
                </tr>
              </thead>
              <tbody>
                {report.percentiles.map((r) => (
                  <tr
                    key={r.outcome}
                    style={{ borderBottom: '1px solid var(--color-border-hairline)' }}
                  >
                    <td style={td()}>{r.label}</td>
                    <td style={td('right')}>{fmt(r.outcome, r.min)}</td>
                    <td style={td('right')}>{fmt(r.outcome, r.p10)}</td>
                    <td style={td('right')}>{fmt(r.outcome, r.p25)}</td>
                    <td style={{ ...td('right'), fontWeight: 600 }}>{fmt(r.outcome, r.p50)}</td>
                    <td style={td('right')}>{fmt(r.outcome, r.mean)}</td>
                    <td style={td('right')}>{fmt(r.outcome, r.p75)}</td>
                    <td style={td('right')}>{fmt(r.outcome, r.p90)}</td>
                    <td style={td('right')}>{fmt(r.outcome, r.max)}</td>
                    <td style={td('right')}>
                      {r.outcome === 'profit_before_tax' ||
                      r.outcome === 'profit_after_tax' ||
                      r.outcome === 'irr_annual' ? (
                        <span
                          style={{
                            color:
                              r.p_loss > 0.05
                                ? 'var(--color-negative, #dc2626)'
                                : 'var(--color-text-primary)',
                            fontWeight: r.p_loss > 0 ? 500 : 400,
                          }}
                        >
                          {(r.p_loss * 100).toFixed(1)}%
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Profit histogram */}
        <Section
          title="Profit distribution"
          subtitle="Distribution of portfolio profit (pre-tax) across trials"
        >
          <DistributionChart values={profitOutcomes} valueLabel="Profit (pre-tax)" negativeIsBad />
        </Section>

        {/* Peak equity histogram */}
        <Section
          title="Peak equity distribution"
          subtitle="Where the equity-call peak lands across trials"
        >
          <DistributionChart
            values={equityOutcomes}
            valueLabel="Peak equity"
            negativeIsBad={false}
          />
        </Section>

        {/* V4.7b — editable driver envelopes. URL-driven via GET form
            so a particular sim is bookmarkable + shareable. */}
        <Section
          title="Driver envelopes"
          subtitle="Triangular min / mode / max per driver. Run simulation re-renders the page with the new sweep."
        >
          <DriverControls
            trials={report.trials}
            distributions={report.distributions}
            isDefault={isDefault}
          />
        </Section>
      </div>
    </DashboardShell>
  );
}

function fmt(outcome: string, value: number): string {
  if (outcome === 'irr_annual' || outcome === 'yield_on_cost') {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (outcome === 'moic') {
    return `${value.toFixed(2)}×`;
  }
  return formatMoney(value * 100, { compact: true, precision: 2 });
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
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
          style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}
        >
          {title}
        </h2>
        {subtitle && (
          <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {subtitle}
          </p>
        )}
      </header>
      {children}
    </section>
  );
}

function KpiTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'negative' | 'neutral';
}) {
  return (
    <div
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderLeft:
          tone === 'negative'
            ? '3px solid var(--color-negative, #dc2626)'
            : '1px solid var(--color-border-hairline)',
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
          color:
            tone === 'negative' ? 'var(--color-negative, #dc2626)' : 'var(--color-text-primary)',
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
