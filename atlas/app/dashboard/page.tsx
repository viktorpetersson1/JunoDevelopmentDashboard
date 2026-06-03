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
import { findManyProjects } from '@/lib/repos/project';
import { aggregatePortfolio } from '@/lib/calc/portfolio/aggregate';
import { getActiveGlobals } from '@/lib/globals/active';
import { getActiveScenario } from '@/lib/scenarios/active';
import { buildProjectPnL } from '@/lib/finance/project-pnl';
import { computeRolloutTrigger } from '@/lib/finance/rollout-trigger';
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

  const [active, globalsCtx] = await Promise.all([getActiveScenario(), getActiveGlobals()]);
  const globals = globalsCtx.globals;
  const portfolio = aggregatePortfolio(projects, globals, active.scenario);
  const todayYM = serverMonthYM();

  // Run engine on every project; build per-project results once for all chips.
  const results = projects.map((p) => ({
    project: p,
    result: runProject(p as unknown as ProjectInput, globals, BASELINE_SCENARIO),
    tier: getCommitmentTier(p),
  }));

  const committed = results.filter((r) => r.tier === 'committed');

  // ── Row 1: strategic chips ─────────────────────────────────────────────

  // 1a. Next capital call — first future month with debt_drawn > 0 (committed only)
  let nextCallDate: string | null = null;
  let nextCallAmount = 0;
  for (const { result } of committed) {
    for (let i = 0; i < result.monthly.dates.length; i++) {
      const d = result.monthly.dates[i] ?? '';
      const drawn = result.monthly.debt_drawn[i] ?? 0;
      if (d >= todayYM && drawn > 0) {
        if (!nextCallDate || d < nextCallDate) {
          nextCallDate = d;
          nextCallAmount = drawn;
        }
        break;
      }
    }
  }

  // 1b. Next owner distribution — earliest committed project close × portfolio NPAT
  const committedByClose = [...committed]
    .filter((r) => r.result.sale_date != null)
    .sort((a, b) => ((a.result.sale_date ?? '') < (b.result.sale_date ?? '') ? -1 : 1));
  const nextCloseProject = committedByClose[0] ?? null;
  const nextClosePnl = nextCloseProject
    ? buildProjectPnL(nextCloseProject.result, {
        taxRatePct: nextCloseProject.project.tax_rate_pct,
      })
    : null;

  // 1c. KPC LOC headroom
  let locLimit = 6_000_000;
  let locDrawn = 0;
  let locRate = 6;
  try {
    const supabase = createSupabaseServerClient();
    const { data } = await supabase
      .schema('atlas')
      .from('capital_sources')
      .select('limit_usd, drawn_usd, interest_rate_pct')
      .eq('source_kind', 'kpc_loc')
      .maybeSingle();
    if (data) {
      locLimit = Number(data.limit_usd ?? 6_000_000);
      locDrawn = Number(data.drawn_usd ?? 0);
      locRate = Number(data.interest_rate_pct ?? 6);
    }
  } catch {
    // fallback to confirmed values
  }
  const locAvailable = locLimit - locDrawn;
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
  const rolloutColor: 'green' | 'amber' | 'red' =
    rollout.state === 'overdue' || rollout.state === 'red'
      ? 'red'
      : rollout.state === 'amber'
        ? 'amber'
        : 'green';

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
  const capBreachCount = portfolio.monthly.cap_breach_months ?? 0;
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
  const effectiveTaxRate = globals.apply_tax !== false
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
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.025em', color: 'var(--color-text-primary)' }}>
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
            <h2 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-tertiary)', margin: '0 0 16px' }}>
              Boardroom strip
            </h2>

            {/* Row: Next capital call */}
            <BoardroomRow
              label="NEXT CAPITAL CALL"
              value={nextCallDate ? compact(nextCallAmount) : '—'}
              detail={nextCallDate ? `${fmtYM(nextCallDate)} · KPC LOC / Harrison` : 'No upcoming draws'}
              href="/analytics/capital"
              overdue={false}
            />

            {/* Row: Next owner distribution */}
            <BoardroomRow
              label="NEXT OWNER DISTRIBUTION"
              value={nextClosePnl ? compact(nextClosePnl.net_profit_after_tax_usd) : '—'}
              detail={nextCloseProject ? `${fmtYM(nextCloseProject.result.sale_date ?? '—')} · ${nextCloseProject.project.name}` : 'No committed closes yet'}
              href="/earnings"
              overdue={false}
            />

            {/* Row: KPC LOC headroom */}
            <BoardroomRow
              label="KPC LOC HEADROOM"
              value={compact(locAvailable)}
              detail={`of ${compact(locLimit)} available · ${(locUtilPct * 100).toFixed(0)}% utilized · ${locRate}%`}
              href="/analytics/capital"
              overdue={locColor === 'red'}
              warn={locColor === 'amber'}
            />

            {/* Row: Rollout pacing */}
            <BoardroomRow
              label="ROLLOUT PACING"
              value={rollout.state === 'unconfigured' ? 'Set target' : rollout.next_start_required_by ? `Start by ${fmtYM(rollout.next_start_required_by)}` : 'On pace'}
              detail={rollout.state === 'unconfigured' ? 'Settings → General → Rollout target' : rollout.rationale.slice(0, 70) + (rollout.rationale.length > 70 ? '…' : '')}
              href="/pipeline"
              overdue={rolloutColor === 'red'}
              warn={rolloutColor === 'amber'}
              last
            />

            {/* Tactical strip (3 cells compressed below Boardroom) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, marginTop: 12, border: '1px solid var(--color-border-hairline)', borderRadius: 8, overflow: 'hidden' }}>
              <TacticalCell label="90d cash" value={compact(Math.abs(cash90 < 0 ? cash90 : 0))} sub={cash90 < 0 ? 'net outflow' : 'net inflow'} href="/dashboard" />
              <TacticalCell label="Pipeline rev" value={compact(pipelineRevAll)} sub={`${compact(pipelineRevCommitted)} committed`} href="/projects" border />
              <TacticalCell label={`Starts ${currentYear}`} value={`${starts2026} / ${targetStarts}`} sub={starts2026 >= targetStarts ? 'on target' : `${targetStarts - starts2026} to go`} href="/pipeline" border />
            </div>
          </section>

          {/* ── Today's Desk ─────────────────────────────────────── */}
          <section style={card}>
            <h2 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-tertiary)', margin: '0 0 16px' }}>
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
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>Portfolio cash flow</h2>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-tertiary)' }}>12 months</span>
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
  label, value, detail, href, overdue = false, warn = false, last = false,
}: { label: string; value: string; detail: string; href: string; overdue?: boolean; warn?: boolean; last?: boolean; }) {
  const valueColor = overdue ? 'var(--color-negative, #b91c1c)' : warn ? 'var(--color-warning, #a16207)' : 'var(--color-text-primary)';
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
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-tertiary)', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: valueColor, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 3 }}>{detail}</div>
      </div>
      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>details →</span>
    </Link>
  );
}

// ─── T110 Today's Desk row ────────────────────────────────────────────────────

function DeskRow({
  count, label, emptyLabel, href, last = false,
}: { count: number; label: string; emptyLabel: string; href: string; last?: boolean; }) {
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
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: count > 0 ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>
        {count > 0 && (
          <StatusDot severity="error" title={`${count} ${label}`} message={`Open items requiring attention.`} />
        )}
        {count > 0
          ? <><strong style={{ fontWeight: 700 }}>{count}</strong>&nbsp;{label}</>
          : emptyLabel}
      </span>
      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{count > 0 ? 'review →' : '✓'}</span>
    </Link>
  );
}

// ─── T110 Tactical cell ───────────────────────────────────────────────────────

function TacticalCell({ label, value, sub, href, border = false }: { label: string; value: string; sub?: string; href: string; border?: boolean }) {
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
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-tertiary)' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
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
