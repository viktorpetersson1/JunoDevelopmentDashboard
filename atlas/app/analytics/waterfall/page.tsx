/**
 * V4.4 — /waterfall (INVENTORY §18 Owner Waterfall).
 *
 * Distribution waterfall across the live cap table: 6 KPI tiles,
 * equity-timeline chart, by-project table, per-investor waterfall panel,
 * 5-tier European distribution table, after-tax returns (conditional),
 * pro-rata distribution check.
 *
 * Calc port: lib/calc/waterfall — pure functions translated from
 * vanilla engine.js::computeWaterfall + distributionWaterfall (the
 * portfolio aggregator deferred these; this file closes that gap).
 *
 * Cap table source: lib/repos/settings::fetchCapTable. Shares in bps
 * are converted to fractions here (10000 bps = 100%). Pref/hurdle/carry
 * are NOT on the owners table today — V4.4 ships industry-standard
 * defaults (8% pref / 20% hurdle / 20% carry). Per-owner overrides are
 * a Settings-tab follow-up.
 *
 * Surfaces dead-link #3 from the QA audit (the prior /waterfall slot
 * 404'd).
 */

import { DashboardShell } from '../../_components/dashboard-shell';
import { AnalyticsTabs } from '../../_components/analytics-tabs';
import { EquityTimelineChart } from './_components/equity-timeline-chart';
import { findManyProjects } from '@/lib/repos/project';
import { aggregatePortfolio } from '@/lib/calc/portfolio/aggregate';
import { getActiveGlobals } from '@/lib/globals/active';
import { getActiveScenario } from '@/lib/scenarios/active';
import {
  computeWaterfall,
  type InvestorWaterfallResult,
  type WaterfallInvestorInput,
} from '@/lib/calc/waterfall';
import { formatMoney } from '@/lib/utils/money';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { fetchCapTable, type CapTableEntryView } from '@/lib/repos/settings';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

// Industry-default European-waterfall terms used when owners table has no
// per-owner override. 8% pref / 20% hurdle / 20% carry is the standard PE
// real-estate fund posture; see DECISIONS.md (V4.4 entry).
const DEFAULT_PREF = 0.08;
const DEFAULT_HURDLE = 0.2;
const DEFAULT_CARRY = 0.2;

/** Convert a CapTableEntryView into the calc port's investor input shape. */
function toInvestorInput(row: CapTableEntryView): WaterfallInvestorInput {
  return {
    id: row.ownerId,
    name: row.displayName,
    equity_share_pct: row.shareBps / 10_000,
    is_sponsor: row.isSponsor,
    preferred_return_pct: DEFAULT_PREF,
    hurdle_pct: DEFAULT_HURDLE,
    carry_pct: DEFAULT_CARRY,
    tax_rate_pct: row.taxRateBps / 10_000,
  };
}

export default async function WaterfallPage() {
  const { profile, user } = await requireAuthOrRedirect('/analytics/waterfall');
  const { projects } = await findManyProjects({ limit: 100 });
  const [active, globalsCtx] = await Promise.all([getActiveScenario(), getActiveGlobals()]);
  const [portfolio, capTable] = await Promise.all([
    Promise.resolve(aggregatePortfolio(projects, globalsCtx.globals, active.scenario)),
    fetchCapTable(),
  ]);

  const investors = capTable.map(toInvestorInput);
  const sumShare = investors.reduce((a, x) => a + x.equity_share_pct, 0);
  // Tolerate small drift (e.g. 9999 bps from rounding) — the calc still
  // runs; we flag it in the pro-rata check panel for the user.
  const proRataOk = Math.abs(sumShare - 1) < 0.005;

  const waterfall = investors.length
    ? computeWaterfall(portfolio.monthly, investors, {
        tax_rate_pct: 0,
        tax_state_rate_pct: 0,
        apply_tax: false,
      })
    : [];

  const k = portfolio.kpis;
  const totalIn = k.total_equity_in;
  const totalOut = k.total_equity_out;
  const netGain = totalOut - totalIn;

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  // 6 KPI tiles per INVENTORY §18.
  const kpis = [
    {
      label: 'Total equity in',
      value: formatMoney(totalIn * 100, { compact: true, precision: 2 }),
      hint: 'cumulative drawn',
    },
    {
      label: 'Total equity returned',
      value: formatMoney(totalOut * 100, { compact: true, precision: 2 }),
      hint: 'across horizon',
    },
    {
      label: 'Net gain',
      value: formatMoney(netGain * 100, { compact: true, precision: 2 }),
      hint: netGain >= 0 ? 'profit' : 'loss',
      tone: (netGain < 0 ? 'negative' : 'neutral') as 'negative' | 'neutral',
    },
    {
      label: 'Portfolio IRR',
      value: k.irr_annual != null ? `${(k.irr_annual * 100).toFixed(1)}%` : '—',
      hint: 'annualized',
    },
    {
      label: 'Payback',
      value: k.payback_months != null ? `${k.payback_months} mo` : '—',
      hint: 'first month equity_out ≥ equity_in',
    },
    {
      label: 'Peak deployed',
      value: formatMoney(k.peak_equity_required * 100, { compact: true, precision: 2 }),
      hint: k.peak_equity_month ?? 'across pipeline',
    },
  ];

  return (
    <DashboardShell
      activeHref="/analytics"
      user={dashboardUser}
      activeScenarioId={active.activeId}
      activeScenarioName={active.displayName}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <AnalyticsTabs activeKey="waterfall" />
        <header>
          <h1
            style={{ fontSize: 24, fontWeight: 600, margin: 0, color: 'var(--color-text-primary)' }}
          >
            Owner waterfall
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            How portfolio cash flow distributes across the cap table — 5-tier European waterfall,
            per-investor IRR + MOIC, sponsor promote roll-up.
          </p>
        </header>

        {/* Cap-table-empty guardrail — surface lights up cleanly with zero
            owners; show actionable empty state instead of a confusing 0 page. */}
        {investors.length === 0 && (
          <EmptyState
            title="No cap-table entries"
            body="Add owners and set their basis-point share under Settings → Cap table. The waterfall recomputes from the live cap table on every page load."
          />
        )}

        {/* KPI strip */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
          }}
        >
          {kpis.map((tile) => (
            <KpiTile key={tile.label} {...tile} />
          ))}
        </section>

        {/* Equity timeline */}
        <Section
          title="Equity timeline"
          subtitle="Cumulative deployed vs returned across the model horizon"
        >
          <EquityTimelineChart monthly={portfolio.monthly} />
        </Section>

        {/* By project */}
        <Section
          title="By project"
          subtitle={`${portfolio.by_project.length} project${portfolio.by_project.length === 1 ? '' : 's'} in the model — equity drawn, return, hold, MOIC, IRR`}
        >
          <ByProjectTable rows={portfolio.by_project} />
        </Section>

        {/* Per-investor waterfall */}
        {investors.length > 0 && (
          <Section
            title="Per-investor waterfall"
            subtitle={`Defaults applied: ${(DEFAULT_PREF * 100).toFixed(0)}% pref, ${(DEFAULT_HURDLE * 100).toFixed(0)}% hurdle, ${(DEFAULT_CARRY * 100).toFixed(0)}% carry. Per-owner overrides land in a follow-up.`}
          >
            <InvestorTable rows={waterfall} />
          </Section>
        )}

        {/* 5-tier distribution */}
        {investors.length > 0 && (
          <Section
            title="Distribution tiers"
            subtitle="5-tier European waterfall: ROC → pref → GP catch-up → to-hurdle → above-hurdle carry split"
          >
            <TiersTable rows={waterfall} />
          </Section>
        )}

        {/* Pro-rata distribution check */}
        {investors.length > 0 && (
          <Section
            title="Pro-rata check"
            subtitle={
              proRataOk
                ? 'Shares sum to 100% — cap table balances cleanly.'
                : 'Shares do NOT sum to 100% — fix in Settings → Cap table.'
            }
          >
            <ProRataCheck
              sumShare={sumShare}
              totalIn={totalIn}
              totalOut={totalOut}
              ok={proRataOk}
            />
          </Section>
        )}
      </div>
    </DashboardShell>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

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

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 12,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <strong style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>{title}</strong>
      <p style={{ margin: '6px 0 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
        {body}
      </p>
    </div>
  );
}

type ByProjectRow = ReturnType<typeof aggregatePortfolio>['by_project'][number];

function ByProjectTable({ rows }: { rows: ByProjectRow[] }) {
  if (rows.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
        No projects in the model yet.
      </p>
    );
  }
  // Derive per-project equity figures from the monthly series.
  const enriched = rows.map((r) => {
    const m = r.monthly;
    let equityIn = 0;
    let equityReturned = 0;
    let firstCall = -1;
    let lastReturn = -1;
    for (let i = 0; i < m.equity_drawn.length; i++) {
      const d = m.equity_drawn[i] ?? 0;
      const ret = m.equity_returned[i] ?? 0;
      equityIn += d;
      equityReturned += ret;
      if (d > 0 && firstCall < 0) firstCall = i;
      if (ret > 0) lastReturn = i;
    }
    const holdMonths =
      firstCall >= 0 && lastReturn >= 0 ? Math.max(1, lastReturn - firstCall) : null;
    const moic = equityIn > 0 ? equityReturned / equityIn : 0;
    const firstCallDate = firstCall >= 0 ? (m.dates[firstCall] ?? null) : null;
    const lastReturnDate = lastReturn >= 0 ? (m.dates[lastReturn] ?? null) : null;
    return {
      ...r,
      equityIn,
      equityReturned,
      holdMonths,
      moic,
      firstCallDate,
      lastReturnDate,
      gain: equityReturned - equityIn,
    };
  });
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
            <th style={th()}>Project</th>
            <th style={th('right')}>Equity in</th>
            <th style={th('right')}>First call</th>
            <th style={th('right')}>Returned</th>
            <th style={th('right')}>Returned at</th>
            <th style={th('right')}>Hold</th>
            <th style={th('right')}>MOIC</th>
            <th style={th('right')}>IRR</th>
            <th style={th('right')}>Gain</th>
          </tr>
        </thead>
        <tbody>
          {enriched.map((r) => (
            <tr
              key={r.project_id}
              style={{ borderBottom: '1px solid var(--color-border-hairline)' }}
            >
              <td style={td()}>{r.project_name}</td>
              <td style={td('right')}>
                {formatMoney(r.equityIn * 100, { compact: true, precision: 2 })}
              </td>
              <td style={td('right')}>{r.firstCallDate ?? '—'}</td>
              <td style={td('right')}>
                {formatMoney(r.equityReturned * 100, { compact: true, precision: 2 })}
              </td>
              <td style={td('right')}>{r.lastReturnDate ?? '—'}</td>
              <td style={td('right')}>{r.holdMonths != null ? `${r.holdMonths} mo` : '—'}</td>
              <td style={td('right')}>{r.moic.toFixed(2)}×</td>
              <td style={td('right')}>
                {r.kpis.irr_annual != null ? `${(r.kpis.irr_annual * 100).toFixed(1)}%` : '—'}
              </td>
              <td
                style={{
                  ...td('right'),
                  color:
                    r.gain < 0 ? 'var(--color-negative, #dc2626)' : 'var(--color-text-primary)',
                }}
              >
                {formatMoney(r.gain * 100, { compact: true, precision: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvestorTable({ rows }: { rows: InvestorWaterfallResult[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
            <th style={th()}>Investor</th>
            <th style={th()}>Role</th>
            <th style={th('right')}>Share</th>
            <th style={th('right')}>Equity in</th>
            <th style={th('right')}>Gross dist.</th>
            <th style={th('right')}>Promote</th>
            <th style={th('right')}>Net dist.</th>
            <th style={th('right')}>Net MOIC</th>
            <th style={th('right')}>IRR</th>
            <th style={th()}>Pref / Hurdle</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const promote = r.is_sponsor ? r.promote_received_from_lps : -r.promote_paid_to_sponsor;
            return (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
                <td style={td()}>{r.name}</td>
                <td style={td()}>
                  {r.is_sponsor ? (
                    <span
                      style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: 'var(--color-accent-lime, #ddec65)',
                        color: 'var(--color-text-on-lime, #0d0d0d)',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        fontWeight: 600,
                      }}
                    >
                      Sponsor
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-text-tertiary)' }}>LP</span>
                  )}
                </td>
                <td style={td('right')}>{(r.share * 100).toFixed(1)}%</td>
                <td style={td('right')}>
                  {formatMoney(r.equity_in * 100, { compact: true, precision: 2 })}
                </td>
                <td style={td('right')}>
                  {formatMoney(r.equity_out_gross * 100, { compact: true, precision: 2 })}
                </td>
                <td
                  style={{
                    ...td('right'),
                    color:
                      promote < 0 ? 'var(--color-negative, #dc2626)' : 'var(--color-text-primary)',
                  }}
                >
                  {formatMoney(promote * 100, { compact: true, precision: 2 })}
                </td>
                <td style={td('right')}>
                  {formatMoney(r.net_distribution * 100, { compact: true, precision: 2 })}
                </td>
                <td style={td('right')}>{r.moic.toFixed(2)}×</td>
                <td style={td('right')}>
                  {r.irr_annual != null ? `${(r.irr_annual * 100).toFixed(1)}%` : '—'}
                </td>
                <td style={td()}>
                  <span
                    style={{
                      fontSize: 11,
                      color: r.pref_cleared
                        ? 'var(--color-positive, #15803d)'
                        : 'var(--color-text-tertiary)',
                    }}
                    title={`Pref ${(r.preferred_return_pct * 100).toFixed(0)}% / Hurdle ${(r.hurdle_pct * 100).toFixed(0)}%`}
                  >
                    {r.pref_cleared ? '✓ pref' : '· pref'}{' '}
                    {r.hurdle_cleared ? '✓ hurdle' : '· hurdle'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TiersTable({ rows }: { rows: InvestorWaterfallResult[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
            <th style={th()}>Investor</th>
            <th style={th('right')}>Hold</th>
            <th style={th('right')}>1. ROC</th>
            <th style={th('right')}>2. Pref → LP</th>
            <th style={th('right')}>3a. GP catch-up</th>
            <th style={th('right')}>3b. To hurdle</th>
            <th style={th('right')}>4a. Above → LP</th>
            <th style={th('right')}>4b. Carry → GP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
              <td style={td()}>{r.name}</td>
              <td style={td('right')}>{r.tiers.holdMonths} mo</td>
              <td style={td('right')}>
                {formatMoney(r.tiers.tier1_return_of_capital * 100, {
                  compact: true,
                  precision: 2,
                })}
              </td>
              <td style={td('right')}>
                {formatMoney(r.tiers.tier2_pref_return * 100, { compact: true, precision: 2 })}
              </td>
              <td style={td('right')}>
                {formatMoney(r.tiers.tier3a_gp_catchup * 100, { compact: true, precision: 2 })}
              </td>
              <td style={td('right')}>
                {formatMoney(r.tiers.tier3b_to_hurdle * 100, { compact: true, precision: 2 })}
              </td>
              <td style={td('right')}>
                {formatMoney(r.tiers.tier4_to_investor * 100, { compact: true, precision: 2 })}
              </td>
              <td style={td('right')}>
                {formatMoney(r.tiers.tier4_to_sponsor * 100, { compact: true, precision: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProRataCheck({
  sumShare,
  totalIn,
  totalOut,
  ok,
}: {
  sumShare: number;
  totalIn: number;
  totalOut: number;
  ok: boolean;
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <tbody>
        <tr style={{ borderTop: '1px solid var(--color-border-hairline)' }}>
          <td style={{ padding: '10px 0', color: 'var(--color-text-secondary)' }}>Sum of shares</td>
          <td
            style={{
              padding: '10px 0',
              textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
              color: ok ? 'var(--color-text-primary)' : 'var(--color-negative, #dc2626)',
              fontWeight: 500,
            }}
          >
            {(sumShare * 100).toFixed(2)}%
          </td>
        </tr>
        <tr style={{ borderTop: '1px solid var(--color-border-hairline)' }}>
          <td style={{ padding: '10px 0', color: 'var(--color-text-secondary)' }}>
            Total equity in
          </td>
          <td
            style={{
              padding: '10px 0',
              textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--color-text-primary)',
              fontWeight: 500,
            }}
          >
            {formatMoney(totalIn * 100, { compact: true, precision: 2 })}
          </td>
        </tr>
        <tr style={{ borderTop: '1px solid var(--color-border-hairline)' }}>
          <td style={{ padding: '10px 0', color: 'var(--color-text-secondary)' }}>
            Total equity out
          </td>
          <td
            style={{
              padding: '10px 0',
              textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--color-text-primary)',
              fontWeight: 500,
            }}
          >
            {formatMoney(totalOut * 100, { compact: true, precision: 2 })}
          </td>
        </tr>
      </tbody>
    </table>
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
