/**
 * T096 — Dashboard strategic cockpit.
 *
 * 5-row layout that answers exec/owner board questions directly:
 *
 *   Row 1: 4 strategic chips (Next capital call · Next distribution ·
 *          KPC LOC headroom · Rollout pacing)
 *   Row 2: 3 tactical chips  (90d cash need · Pipeline revenue · Starts 2026)
 *   Row 3: 3 action cards    (Drafts needing lock · Capital calls drafting ·
 *          Risk cap-breaches)
 *   Row 4: 12-month portfolio cash-flow chart
 *   Row 5: Committed projects (top 2 by target close date)
 *
 * Server Component — all data fetched on the server; the client wrapper
 * owns only the "Committed only" toggle (localStorage-persisted).
 */

import Link from 'next/link';
import { DashboardShell } from '../_components/dashboard-shell';
import { PortfolioCashFlowChart } from '../_components/portfolio-cash-flow-chart';
import { AnnualPnLTable } from '../analytics/forecast/_components/annual-pnl-table';
import { StatusDot } from '@/components/feedback/StatusDot';
import { findActiveCapitalSources, findAllAssignments } from '@/lib/repos/capital-sources';
import { getCapitalPosition, applyCapitalPositionToGlobals } from '@/lib/treasury/capital-position';
import { findManyProjects, findManyProjectsWithUuids } from '@/lib/repos/project';
import { aggregatePortfolio } from '@/lib/calc/portfolio/aggregate';
import { buildCashSchedule } from '@/lib/treasury/portfolio-cash-schedule';
import { buildSelfFundingTrajectory } from '@/lib/treasury/self-funding';
import { buildDistributionForecast } from '@/lib/treasury/distribution-forecast';
import { fetchCapTable } from '@/lib/repos/settings';
import { getActiveGlobals } from '@/lib/globals/active';
import { getActiveScenario } from '@/lib/scenarios/active';
import { buildProjectPnL } from '@/lib/finance/project-pnl';
import { computeRolloutTrigger } from '@/lib/finance/rollout-trigger';
import { rolloutChip } from '@/lib/finance/rollout-chip';
import { getCommitmentTier } from '@/lib/projects/commitment-tier';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { runProject } from '@/lib/calc/project/runProject';
import { BASELINE_SCENARIO } from '@/lib/calc/baselines';
import type { ProjectInput } from '@/lib/calc/project/types';
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

// ─── Sub-components ──────────────────────────────────────────────────────────

// T103.5/.9 — every card uses the canonical white-on-grey-on-white pattern.
// Container hierarchy: white page → soft grey <Section> → white Card inside.
// Cards keep hairline border (Ramp pattern), section provides the grouping.
const card: CSSProperties = {
  background: 'var(--ja-card-bg)',
  border: 'var(--ja-card-border)',
  borderRadius: 'var(--ja-card-radius)',
  padding: 'var(--ja-card-padding)',
};

// ─── Page ────────────────────────────────────────────────────────────────────
// T110 (V6.1): Chip / SmallChip / ActionCard removed — replaced by
// BoardroomRow / DeskRow / TacticalCell below.

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
  // T130 (V7 Rule 1): ONE resolved capital position feeds the chip AND the
  // engine — no surface may compute the facility differently.
  const globals = applyCapitalPositionToGlobals(globalsCtx.globals, capitalPosition);
  const portfolio = aggregatePortfolio(projects, globals, active.scenario);
  const todayYM = serverMonthYM();

  // T126 — ONE treasury schedule is the source of truth for the Boardroom
  // strategic answers. No surface independently recomputes a treasury number:
  // capital call, distribution, self-funding all read this same schedule.
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

  // Run engine on every project; build per-project results once for all chips.
  const results = projects.map((p) => ({
    project: p,
    result: runProject(p as unknown as ProjectInput, globals, BASELINE_SCENARIO),
    tier: getCommitmentTier(p),
  }));

  const committed = results.filter((r) => r.tier === 'committed');

  // ── Row 1: strategic chips ─────────────────────────────────────────────

  // 1a. Next capital call — first schedule month with a net draw (T126: reads
  //     the cash schedule, NOT a separate committed-only loop, so the chip
  //     reconciles with /analytics/cash-schedule exactly).
  const nextCallRow = schedule.rows.find((r) => r.net_cash_need > 1) ?? null;
  const nextCallDate = nextCallRow?.month ?? null;
  const nextCallAmount = nextCallRow?.net_cash_need ?? 0;

  // 1b. Next owner distribution — first schedule month with a distribution
  //     (T126: reads the distribution forecast, D-064 owner-tax model, so the
  //     chip reconciles with /earnings).
  const nextDistMonth = distribution.monthly.find((m) => m.total_distribution > 1) ?? null;

  // 1c. KPC LOC headroom — T130 (V7): reads the SAME resolved capital position
  // the engine ran with. No hardcoded fallback: unconfigured renders an explicit
  // empty state (Rule 6), never $6M-on-faith and never $0-as-fact.
  const locConfigured = capitalPosition.configured;
  const locLimit = capitalPosition.configured ? capitalPosition.facilityUsd : 0;
  const locDrawn = capitalPosition.configured ? capitalPosition.drawnUsd : 0;
  const locRate = capitalPosition.configured ? capitalPosition.interestRate * 100 : 0;
  const locAvailable = capitalPosition.configured ? capitalPosition.headroomUsd : 0;
  const locUtilPct = locLimit > 0 ? locDrawn / locLimit : 0;
  const locColor: 'green' | 'amber' | 'red' =
    locUtilPct >= 0.9 ? 'red' : locUtilPct >= 0.75 ? 'amber' : 'green';

  // 1d. Rollout pacing
  const rollout = computeRolloutTrigger({
    projects: results.map((r) => ({
      project_id: r.project.id,
      recognition_month: r.result.sale_date,
      npat_usd: buildProjectPnL(r.result, { taxRatePct: r.project.tax_rate_pct })
        .net_profit_after_tax_usd,
    })),
    target_annual_npat_usd: globals.target_annual_npat_usd ?? null,
    fixed_overhead_annual_usd: globals.fixed_overhead_annual_usd,
    project_time_to_npat_months: globals.project_time_to_npat_months ?? 18,
    today_month: todayYM,
  });
  // T132 (V7 alert hygiene): presentation via the pure rolloutChip() mapper —
  // never a past "start by" date, never red-on-stale, unconfigured = prompt.
  const { value: rolloutValue, detail: rolloutDetail, color: rolloutColor } = rolloutChip(rollout);

  // ── Row 2: tactical chips ──────────────────────────────────────────────

  // 2a. 90d cash need — net of outflows for next 90 days from portfolio series
  const months90 = 3;
  let cash90 = 0;
  for (let i = 0; i < Math.min(months90, portfolio.monthly.net_cash.length); i++) {
    cash90 += portfolio.monthly.net_cash[i] ?? 0;
  }

  // 2b. Pipeline revenue — committed vs prospect breakdown
  const pipelineRevAll = results.reduce((s, r) => s + r.result.kpis.total_sales, 0);
  const pipelineRevCommitted = committed.reduce((s, r) => s + r.result.kpis.total_sales, 0);
  const _pipelineRevProspect = pipelineRevAll - pipelineRevCommitted; // reserved for V6.2 strategy page

  // 2c. Starts 2026 — from portfolio pipeline service (simple approximation)
  const currentYear = new Date().getUTCFullYear();
  const starts2026 = results.filter((r) => {
    const sd = r.project.start_date ?? r.project.purchase_date ?? '';
    return sd.startsWith(String(currentYear));
  }).length;
  const targetStarts = globals.target_starts_per_year ?? 4;

  // ── Row 3: action counts ───────────────────────────────────────────────

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

  // T110: committed-projects row removed. top2Committed reserved for V6.2.
  // const _top2Committed = [...committed].sort(...).slice(0, 2);

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  // T110 (V6.1): compute effective tax rate for Annual P&L table (promoted from /analytics/forecast)
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
            Atlas — at a glance
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
          {/* ── Boardroom Strip ─────────────────────────────────── */}
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

            {/* Row: Next capital call — T126: reads the cash schedule */}
            <BoardroomRow
              label="NEXT CAPITAL CALL"
              value={nextCallDate ? compact(nextCallAmount) : '—'}
              detail={
                nextCallDate
                  ? `${fmtYM(nextCallDate)} · portfolio draw across the funding stack`
                  : 'No draws in the 36-month window'
              }
              href="/analytics/cash-schedule"
              overdue={false}
            />

            {/* Row: Next owner distribution — T126: reads the distribution forecast */}
            <BoardroomRow
              label="NEXT OWNER DISTRIBUTION"
              value={nextDistMonth ? compact(nextDistMonth.total_distribution) : '—'}
              detail={
                nextDistMonth
                  ? `${fmtYM(nextDistMonth.month)} · owner tax distribution at close`
                  : 'No distributions in the 36-month window'
              }
              href="/earnings"
              overdue={false}
            />

            {/* Row: KPC LOC headroom — T130 (V7): same resolved position as the
                engine; Rule-6 explicit empty state when unconfigured. */}
            <BoardroomRow
              label="KPC LOC HEADROOM"
              value={locConfigured ? compact(locAvailable) : 'Not configured'}
              detail={
                locConfigured
                  ? `of ${compact(locLimit)} available · ${(locUtilPct * 100).toFixed(0)}% utilized · ${locRate}%`
                  : 'No capital sources configured — Settings → Capital Sources'
              }
              href={locConfigured ? '/analytics/loc' : '/settings'}
              overdue={locConfigured && locColor === 'red'}
              warn={locConfigured && locColor === 'amber'}
            />

            {/* Row: Rollout pacing — T132: never a past date, never red-on-stale. */}
            <BoardroomRow
              label="ROLLOUT PACING"
              value={rolloutValue}
              detail={rolloutDetail}
              href="/pipeline/capacity"
              overdue={rolloutColor === 'red'}
              warn={rolloutColor === 'amber'}
            />

            {/* Row: Self-funding trajectory (T123) */}
            <BoardroomRow
              label="SELF-FUNDING TRAJECTORY"
              value={
                selfFunding.insufficient_data
                  ? '—'
                  : selfFunding.self_funding_year
                    ? selfFunding.self_funding_year
                    : 'Beyond 36mo'
              }
              detail={
                selfFunding.insufficient_data
                  ? 'No project NPAT recognised in window yet'
                  : selfFunding.self_funding_year
                    ? `Retained NPAT ≥ equity need in FY ${selfFunding.self_funding_year}`
                    : 'Retained NPAT below equity need across the window'
              }
              href="/analytics/self-funding"
              last
            />

            {/* Tactical strip (3 cells compressed below Boardroom) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 0,
                marginTop: 12,
                border: '1px solid var(--color-border-hairline)',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <TacticalCell
                label="90d cash"
                value={compact(Math.abs(cash90 < 0 ? cash90 : 0))}
                sub={cash90 < 0 ? 'net outflow' : 'net inflow'}
                href="/dashboard"
              />
              <TacticalCell
                label="Pipeline rev"
                value={compact(pipelineRevAll)}
                sub={`${compact(pipelineRevCommitted)} committed`}
                href="/projects"
                border
              />
              <TacticalCell
                label={`Starts ${currentYear}`}
                value={`${starts2026} / ${targetStarts}`}
                sub={
                  starts2026 >= targetStarts ? 'on target' : `${targetStarts - starts2026} to go`
                }
                href="/pipeline"
                border
              />
            </div>
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
              href="/analytics/capital"
            />
            <DeskRow
              count={capBreachCount}
              label="cap-breach months in window"
              emptyLabel="No LOC breaches forecast"
              href="/analytics/stress"
              last
            />
          </section>
        </div>

        {/* ── Portfolio cash flow chart ── */}
        <section style={card}>
          <header
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 16,
            }}
          >
            <h2
              style={{
                fontSize: 16,
                fontWeight: 700,
                margin: 0,
                color: 'var(--color-text-primary)',
              }}
            >
              Portfolio cash flow
            </h2>
            <span
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--color-text-tertiary)',
              }}
            >
              12 months
            </span>
          </header>
          <PortfolioCashFlowChart monthly={portfolio.monthly} />
        </section>

        {/* ── Annual P&L (promoted from /analytics/forecast — T110) ── */}
        <AnnualPnLTable annual={portfolio.annual} effectiveTaxRate={effectiveTaxRate} />
      </div>
    </DashboardShell>
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

// ─── T110 Tactical cell ───────────────────────────────────────────────────────

function TacticalCell({
  label,
  value,
  sub,
  href,
  border = false,
}: {
  label: string;
  value: string;
  sub?: string;
  href: string;
  border?: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: '10px 14px',
        textDecoration: 'none',
        color: 'inherit',
        borderLeft: border ? '1px solid var(--color-border-hairline)' : 'none',
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-tertiary)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{sub}</div>}
    </Link>
  );
}

// ─── Legacy components (no longer rendered — kept for reference) ──────────────
// NOTE: Chip, SmallChip, ActionCard were the V5.2 Row 1-3 components.
// Replaced by BoardroomRow, DeskRow, TacticalCell in T110 (V6.1).
// The committed-projects row (Row 5) is removed — information is in Projects list.
// Keep the unused function stubs below so old imports/tests don't break.

// (V5.2 committed-projects row removed in T110 — data now in /projects table view)
