/**
 * V7 T135 — Home = the Juno company view.
 *
 * One scrollable Server Component that answers the exec questions in order
 * (composition, not new math — every number is buildCashSchedule /
 * aggregatePortfolio output, Rule 1):
 *
 *   1. Boardroom strip — 4 chips: Next capital call · Cash requirement 90d ·
 *      KPC LOC position · Next owner distribution. Each `details →` scrolls
 *      to the owning section below (no cross-page hops). Today's Desk beside.
 *   2. #cashflow      — company cash flow (12-month window, full-horizon toggle)
 *   3. #requirements  — cash requirements, next 12 months (T120 schedule)
 *   4. #pnl           — annual P&L
 *   5. #capital       — Capital & LOC (KPI row + drawdown chart, absorbed
 *                       from /analytics/capital + /analytics/loc)
 *   6. #self-funding  — self-funding trajectory, collapsed by default
 *
 * The absorbed /analytics/{capital,cash-schedule,loc,self-funding} URLs 301
 * here with anchors (middleware).
 */

import Link from 'next/link';
import { DashboardShell } from '../_components/dashboard-shell';
import { PortfolioCashFlowChart } from '../_components/portfolio-cash-flow-chart';
import { AnnualPnLTable } from '../analytics/forecast/_components/annual-pnl-table';
import { CashRequirementsTable } from './_components/cash-requirements-table';
import { CapitalLocSection } from './_components/capital-loc-section';
import { SelfFundingChart } from '../analytics/self-funding/_components/self-funding-chart';
import { StatusDot } from '@/components/feedback/StatusDot';
import { findActiveCapitalSources, findAllAssignments } from '@/lib/repos/capital-sources';
import { getCapitalPosition, applyCapitalPositionToGlobals } from '@/lib/treasury/capital-position';
import { findManyProjects, findManyProjectsWithUuids } from '@/lib/repos/project';
import { aggregatePortfolio } from '@/lib/calc/portfolio/aggregate';
import { buildCashSchedule } from '@/lib/treasury/portfolio-cash-schedule';
import { buildCashRequirements } from '@/lib/treasury/cash-requirements';
import { buildSelfFundingTrajectory } from '@/lib/treasury/self-funding';
import { buildDistributionForecast } from '@/lib/treasury/distribution-forecast';
import { fetchCapTable } from '@/lib/repos/settings';
import { getActiveGlobals } from '@/lib/globals/active';
import { getActiveScenario } from '@/lib/scenarios/active';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { CSSProperties } from 'react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

// ─── helpers ────────────────────────────────────────────────────────────────

function serverMonthYM(): string {
  const n = new Date();
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}`;
}

function compact(usd: number): string {
  const abs = Math.abs(usd);
  const s = usd < 0 ? '−' : '';
  if (abs >= 100_000_000) return `${s}$${(abs / 1_000_000).toFixed(0)}M`;
  if (abs >= 10_000_000) return `${s}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return `${s}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${s}$${(abs / 1_000).toFixed(0)}k`;
  return `${s}$${Math.round(abs)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtYM(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m ?? 1) - 1] ?? ''} ${y}`;
}

// T103.5/.9 — canonical white-on-grey-on-white card. Anchored sections get
// scroll-margin so the topbar doesn't cover them after a chip jump.
const card: CSSProperties = {
  background: 'var(--ja-card-bg)',
  border: 'var(--ja-card-border)',
  borderRadius: 'var(--ja-card-radius)',
  padding: 'var(--ja-card-padding)',
  scrollMarginTop: 80,
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const { profile, user } = await requireAuthOrRedirect('/dashboard');
  const { projects } = await findManyProjects({ limit: 100 });

  const [
    active,
    globalsCtx,
    capitalPosition,
    projectsWithUuids,
    treasurySources,
    treasuryAssignments,
    capTable,
  ] = await Promise.all([
    getActiveScenario(),
    getActiveGlobals(),
    getCapitalPosition(),
    findManyProjectsWithUuids({ limit: 100 }),
    findActiveCapitalSources(),
    findAllAssignments(),
    fetchCapTable(),
  ]);
  // T130 (V7 Rule 1): ONE resolved capital position feeds every chip AND the
  // engine — no surface may compute the facility differently.
  const globals = applyCapitalPositionToGlobals(globalsCtx.globals, capitalPosition);
  const portfolio = aggregatePortfolio(projects, globals, active.scenario);
  const todayYM = serverMonthYM();

  // T126 — ONE treasury schedule is the source of truth for the Boardroom
  // strategic answers. T135 adds the cash-requirements derivation on top;
  // still the same schedule, no independent recompute.
  const schedule = buildCashSchedule({
    projects: projectsWithUuids,
    globals,
    scenario: active.scenario,
    sources: treasurySources,
    assignments: treasuryAssignments,
    todayYM,
  });
  const selfFunding = buildSelfFundingTrajectory(schedule, capTable);
  const distribution = buildDistributionForecast(schedule, capTable);
  const requirements = buildCashRequirements(schedule, {
    monthlyOverheadUsd: (globals.fixed_overhead_annual_usd ?? 0) / 12,
  });

  // ── Boardroom chips (4 — V7 T135) ───────────────────────────────────────

  // 1. Next capital call — first schedule month with a net draw.
  const nextCallRow = schedule.rows.find((r) => r.net_cash_need > 1) ?? null;

  // 2. Cash requirement 90d — from the same requirements derivation the
  //    #requirements table renders (draws + overhead, next 3 months).
  const req90 = requirements.next_90d_requirement;
  const req90Equity = requirements.next_90d_equity;

  // 3. KPC LOC position — T130: the SAME resolved position the engine ran with.
  const locConfigured = capitalPosition.configured;
  const locLimit = capitalPosition.configured ? capitalPosition.facilityUsd : 0;
  const locDrawn = capitalPosition.configured ? capitalPosition.drawnUsd : 0;
  const locRate = capitalPosition.configured ? capitalPosition.interestRate * 100 : 0;
  const locAvailable = capitalPosition.configured ? capitalPosition.headroomUsd : 0;
  const locUtilPct = locLimit > 0 ? locDrawn / locLimit : 0;
  const locColor: 'green' | 'amber' | 'red' =
    locUtilPct >= 0.9 ? 'red' : locUtilPct >= 0.75 ? 'amber' : 'green';

  // 4. Next owner distribution — D-064 owner-tax model over the schedule.
  const nextDistMonth = distribution.monthly.find((m) => m.total_distribution > 1) ?? null;

  // ── Today's Desk counts ─────────────────────────────────────────────────

  let draftSnapshotCount = 0;
  let draftCallCount = 0;
  // T130/T132 (V7 Rule 6): a cap-breach count derived from an UNCONFIGURED
  // facility is noise, not signal — suppress it entirely in that case.
  const capBreachCount = locConfigured ? (portfolio.monthly.cap_breach_months ?? 0) : 0;
  try {
    const supabase = createSupabaseServerClient();
    const [snapRes, callRes] = await Promise.all([
      supabase
        .schema('atlas')
        .from('approval_snapshots')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'draft')
        .eq('is_archived', false),
      supabase
        .schema('atlas')
        .from('capital_calls')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'draft'),
    ]);
    draftSnapshotCount = snapRes.count ?? 0;
    draftCallCount = callRes.count ?? 0;
  } catch {
    // non-critical; action cards show 0 safely
  }

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  // T110 (V6.1): effective tax rate for the Annual P&L table.
  const effectiveTaxRate =
    globals.apply_tax !== false
      ? ((globals.tax_rate_pct ?? 21) + (globals.tax_state_rate_pct ?? 4.5)) / 100
      : 0;

  return (
    <DashboardShell
      activeHref="/dashboard"
      user={dashboardUser}
      activeScenarioId={active.activeId}
      activeScenarioName={active.displayName}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ja-section-gap)' }}>
        {/* ── Page heading ── */}
        <header>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              margin: 0,
              letterSpacing: '-0.025em',
              color: 'var(--color-text-primary)',
            }}
          >
            Home
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            The Juno company view — cash, capital, profit
          </p>
        </header>

        {/* ── Two-column: Boardroom Strip (60%) + Today's Desk (40%) ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '60fr 40fr',
            gap: 16,
            alignItems: 'start',
          }}
        >
          {/* ── Boardroom Strip — 4 chips, in-page anchors ──────────── */}
          <section style={card}>
            <h2
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--color-text-tertiary)',
                margin: '0 0 16px',
              }}
            >
              Boardroom strip
            </h2>

            <BoardroomRow
              label="NEXT CAPITAL CALL"
              value={nextCallRow ? compact(nextCallRow.net_cash_need) : '—'}
              detail={
                nextCallRow
                  ? `${fmtYM(nextCallRow.month)} · portfolio draw across the funding stack`
                  : 'No draws in the 36-month window'
              }
              href="#requirements"
              overdue={false}
            />

            <BoardroomRow
              label="CASH REQUIREMENT 90D"
              value={req90 > 1 ? compact(req90) : '—'}
              detail={
                req90 > 1
                  ? `next 3 months · draws + overhead · of which equity ${compact(req90Equity)}`
                  : 'No cash requirement in the next 3 months'
              }
              href="#requirements"
              overdue={false}
            />

            <BoardroomRow
              label="KPC LOC POSITION"
              value={locConfigured ? compact(locAvailable) : 'Not configured'}
              detail={
                locConfigured
                  ? `headroom of ${compact(locLimit)} · ${(locUtilPct * 100).toFixed(0)}% utilized · ${locRate}%`
                  : 'No capital sources configured — Settings → Capital Sources'
              }
              href={locConfigured ? '#capital' : '/settings'}
              overdue={locConfigured && locColor === 'red'}
              warn={locConfigured && locColor === 'amber'}
            />

            <BoardroomRow
              label="NEXT OWNER DISTRIBUTION"
              value={nextDistMonth ? compact(nextDistMonth.total_distribution) : '—'}
              detail={
                nextDistMonth
                  ? `${fmtYM(nextDistMonth.month)} · owner tax distribution at close`
                  : 'No distributions in the 36-month window'
              }
              href="#self-funding"
              last
            />
          </section>

          {/* ── Today's Desk ─────────────────────────────────────── */}
          <section style={card}>
            <h2
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--color-text-tertiary)',
                margin: '0 0 16px',
              }}
            >
              Today&apos;s desk
            </h2>

            <DeskRow
              count={draftSnapshotCount}
              label="drafts ready to lock"
              emptyLabel="All snapshots current"
              href="/projects"
            />
            <DeskRow
              count={draftCallCount}
              label="capital calls drafting"
              emptyLabel="No draft calls"
              href="#capital"
            />
            <DeskRow
              count={capBreachCount}
              label="cap-breach months in window"
              emptyLabel="No LOC breaches forecast"
              href="#capital"
              last
            />
          </section>
        </div>

        {/* ── 2. Company cash flow ── */}
        <section id="cashflow" style={card}>
          <SectionHeader
            title="Company cash flow"
            hint="Portfolio net cash, equity calls, closing cash, LOC balance"
          />
          <PortfolioCashFlowChart monthly={portfolio.monthly} />
        </section>

        {/* ── 3. Cash requirements (T135 — the "how much and when" table) ── */}
        <section id="requirements" style={card}>
          <SectionHeader
            title="Cash requirements"
            hint={`Next 12 months from ${fmtYM(schedule.start_month)}${
              requirements.peak_month
                ? ` · peak ${fmtYM(requirements.peak_month)} (${compact(requirements.peak_requirement)})`
                : ''
            }`}
          />
          {treasurySources.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: '24px 0',
                textAlign: 'center',
                fontSize: 13,
                color: 'var(--color-text-tertiary)',
              }}
            >
              No capital sources configured — add them under Settings → Capital Sources to activate
              the funding columns. Draws and overhead still shown from the model.
            </p>
          ) : null}
          <CashRequirementsTable req={requirements} />
        </section>

        {/* ── 4. Annual P&L ── */}
        <section id="pnl" style={{ scrollMarginTop: 80 }}>
          <AnnualPnLTable annual={portfolio.annual} effectiveTaxRate={effectiveTaxRate} />
        </section>

        {/* ── 5. Capital & LOC (absorbs /analytics/capital + /analytics/loc) ── */}
        <section id="capital" style={card}>
          <SectionHeader
            title="Capital & LOC"
            hint="KPC LOC utilization, equity beyond the line, senior debt"
          />
          <CapitalLocSection
            monthly={portfolio.monthly}
            kpis={portfolio.kpis}
            locConfigured={locConfigured}
          />
        </section>

        {/* ── 6. Self-funding trajectory — collapsed by default ── */}
        <details id="self-funding" style={{ ...card, padding: 0 }}>
          <summary
            style={{
              cursor: 'pointer',
              listStyle: 'none',
              padding: 'var(--ja-card-padding)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}
          >
            <span>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: 'var(--color-text-primary)',
                }}
              >
                Self-funding trajectory
              </span>
              <span
                style={{
                  marginLeft: 10,
                  fontSize: 12,
                  color: 'var(--color-text-secondary)',
                }}
              >
                {selfFunding.insufficient_data
                  ? 'No project NPAT recognised in window yet'
                  : selfFunding.self_funding_year
                    ? `Retained NPAT ≥ equity need in FY ${selfFunding.self_funding_year}`
                    : 'Retained NPAT below equity need across the window'}
              </span>
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>expand ▾</span>
          </summary>
          <div style={{ padding: '0 var(--ja-card-padding) var(--ja-card-padding)' }}>
            <SelfFundingChart result={selfFunding} />
            <p style={{ margin: '10px 0 0', fontSize: 10, color: 'var(--color-text-tertiary)' }}>
              Retained NPAT = recognised NPAT − owner distributions (blended owner-tax rate,{' '}
              {(selfFunding.distribution_rate * 100).toFixed(1)}% of NPAT). Equity need = equity
              drawn into new starts. NPAT recognised at sale from the same cash schedule as the
              requirements table above.
            </p>
          </div>
        </details>
      </div>
    </DashboardShell>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: 16,
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
        {title}
      </h2>
      {hint && (
        <span
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-text-tertiary)',
          }}
        >
          {hint}
        </span>
      )}
    </header>
  );
}

// ─── T110 Boardroom Strip row ─────────────────────────────────────────────────

function BoardroomRow({
  label,
  value,
  detail,
  href,
  overdue = false,
  warn = false,
  last = false,
}: {
  label: string;
  value: string;
  detail: string;
  href: string;
  overdue?: boolean;
  warn?: boolean;
  last?: boolean;
}) {
  const valueColor = overdue
    ? 'var(--color-negative, #b91c1c)'
    : warn
      ? 'var(--color-warning, #a16207)'
      : 'var(--color-text-primary)';
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 12,
        padding: '10px 0',
        borderBottom: last ? 'none' : '1px solid var(--color-border-subtle)',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-text-tertiary)',
            marginBottom: 3,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: valueColor,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
          }}
        >
          {value}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 3 }}>
          {detail}
        </div>
      </div>
      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
        details →
      </span>
    </Link>
  );
}

// ─── T110 Today's Desk row ────────────────────────────────────────────────────

function DeskRow({
  count,
  label,
  emptyLabel,
  href,
  last = false,
}: {
  count: number;
  label: string;
  emptyLabel: string;
  href: string;
  last?: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '9px 0',
        borderBottom: last ? 'none' : '1px solid var(--color-border-subtle)',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: count > 0 ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
        }}
      >
        {count > 0 && (
          <StatusDot
            severity="error"
            title={`${count} ${label}`}
            message={`Open items requiring attention.`}
          />
        )}
        {count > 0 ? (
          <>
            <strong style={{ fontWeight: 700 }}>{count}</strong>&nbsp;{label}
          </>
        ) : (
          emptyLabel
        )}
      </span>
      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        {count > 0 ? 'review →' : '✓'}
      </span>
    </Link>
  );
}
