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
import { Section } from '../_components/section';
import { PortfolioCashFlowChart } from '../_components/portfolio-cash-flow-chart';
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

function Chip({
  label,
  value,
  detail,
  href,
  color = 'default',
}: {
  label: string;
  value: string;
  detail?: string;
  href: string;
  color?: 'default' | 'amber' | 'red' | 'green';
}) {
  const valueColor =
    color === 'red'
      ? 'var(--color-negative)'
      : color === 'amber'
        ? 'var(--color-warning)'
        : color === 'green'
          ? 'var(--color-positive)'
          : 'var(--color-text-primary)';

  const borderColor =
    color === 'red'
      ? 'var(--color-negative)'
      : color === 'amber'
        ? 'var(--color-warning)'
        : color === 'green'
          ? 'var(--color-positive)'
          : 'var(--color-border-hairline)';

  return (
    <Link
      href={href}
      style={{
        ...card,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        textDecoration: 'none',
        color: 'inherit',
        borderTop: color !== 'default' ? `3px solid ${borderColor}` : card.border,
        transition: 'box-shadow 120ms ease',
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-text-tertiary)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: valueColor,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {detail && (
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
          {detail}
        </div>
      )}
    </Link>
  );
}

function SmallChip({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      style={{
        ...card,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-text-tertiary)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{sub}</div>}
    </Link>
  );
}

function ActionCard({
  label,
  count,
  emptyLabel,
  href,
}: {
  label: string;
  count: number;
  emptyLabel: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      style={{
        ...card,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
        {count > 0 ? (
          <>
            <span
              style={{
                display: 'inline-block',
                width: 7,
                height: 7,
                borderRadius: 999,
                background: 'var(--color-negative)',
                marginRight: 7,
                verticalAlign: 'middle',
              }}
            />
            <strong style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{count}</strong>{' '}
            {label}
          </>
        ) : (
          <span style={{ color: 'var(--color-text-tertiary)' }}>{emptyLabel}</span>
        )}
      </span>
      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>→</span>
    </Link>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

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
  const pipelineRevProspect = pipelineRevAll - pipelineRevCommitted;

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

  // ── Row 5: committed projects (top 2 by target close) ─────────────────
  const top2Committed = [...committed]
    .sort((a, b) => ((a.result.sale_date ?? '9999') < (b.result.sale_date ?? '9999') ? -1 : 1))
    .slice(0, 2);

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  return (
    <DashboardShell
      activeHref="/dashboard"
      user={dashboardUser}
      activeScenarioId={active.activeId}
      activeScenarioName={active.displayName}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ja-section-gap)' }}>
        {/* ── Row 1: strategic chips (grouped in soft-grey section) ── */}
        <Section
          label="Board questions"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
          }}
        >
          <Chip
            label="Next capital call"
            value={nextCallDate ? compact(nextCallAmount) : '—'}
            detail={
              nextCallDate ? `${fmtYM(nextCallDate)} · KPC LOC / Harrison` : 'No upcoming draws'
            }
            href="/analytics/capital"
          />
          <Chip
            label="Next owner distribution"
            value={nextClosePnl ? compact(nextClosePnl.net_profit_after_tax_usd) : '—'}
            detail={
              nextCloseProject
                ? `${fmtYM(nextCloseProject.result.sale_date ?? '—')} · from ${nextCloseProject.project.name}`
                : 'No committed closes yet'
            }
            href="/earnings"
          />
          <Chip
            label="KPC LOC headroom"
            value={compact(locAvailable)}
            detail={`of ${compact(locLimit)} available · ${(locUtilPct * 100).toFixed(0)}% utilized · ${locRate}%`}
            href="/analytics/capital"
            color={locColor}
          />
          <Chip
            label="Rollout pacing"
            value={
              rollout.state === 'unconfigured'
                ? 'Set target'
                : rollout.next_start_required_by
                  ? `Start by ${fmtYM(rollout.next_start_required_by)}`
                  : 'On pace'
            }
            detail={
              rollout.state === 'unconfigured'
                ? 'Settings → General → Rollout target'
                : rollout.rationale.slice(0, 60) + '…'
            }
            href="/pipeline"
            color={rollout.state === 'unconfigured' ? 'default' : rolloutColor}
          />
        </Section>

        {/* ── Row 2: tactical chips (grouped) ── */}
        <Section
          label="Tactical context"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
          }}
        >
          <SmallChip
            label="90-day cash need"
            value={compact(Math.abs(cash90 < 0 ? cash90 : 0))}
            sub={cash90 < 0 ? 'net outflow' : 'net inflow — positive'}
            href="/analytics/forecast"
          />
          <SmallChip
            label="Pipeline revenue"
            value={compact(pipelineRevAll)}
            sub={`${compact(pipelineRevCommitted)} committed · ${compact(pipelineRevProspect)} prospect`}
            href="/projects"
          />
          <SmallChip
            label={`Starts ${currentYear}`}
            value={`${starts2026} / ${targetStarts}`}
            sub={starts2026 >= targetStarts ? 'on target' : `${targetStarts - starts2026} to go`}
            href="/pipeline"
          />
        </Section>

        {/* ── Row 3: action cards (grouped) ── */}
        <Section
          label="What needs you today"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 10,
          }}
        >
          <ActionCard
            label="snapshots need locking"
            count={draftSnapshotCount}
            emptyLabel="All snapshots current"
            href="/projects"
          />
          <ActionCard
            label="capital calls drafting"
            count={draftCallCount}
            emptyLabel="No draft calls"
            href="/analytics/capital"
          />
          <ActionCard
            label="cap-breach months in window"
            count={capBreachCount}
            emptyLabel="No LOC breaches forecast"
            href="/analytics/stress"
          />
        </Section>

        {/* ── Row 4: 12-month cash flow chart (standalone white card — chart
            needs solid white bg, doesn't benefit from the grey grouping). ── */}
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

        {/* ── Row 5: committed projects (grouped) ── */}
        {top2Committed.length > 0 && (
          <Section
            label="Active committed projects"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 12,
            }}
          >
            {top2Committed.map(({ project, result }) => {
              const pnl = buildProjectPnL(result, { taxRatePct: project.tax_rate_pct });
              return (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  style={{
                    ...card,
                    textDecoration: 'none',
                    color: 'inherit',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {project.name}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: 999,
                        background: 'var(--color-positive-soft, #ecfdf5)',
                        color: 'var(--color-positive)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Committed
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      gap: 8,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {[
                      { label: 'NPAT', value: compact(pnl.net_profit_after_tax_usd) },
                      {
                        label: 'Margin',
                        value: `${(pnl.npat_margin_pct * 100).toFixed(1)}%`,
                      },
                      {
                        label: 'IRR',
                        value:
                          pnl.irr_annual != null ? `${(pnl.irr_annual * 100).toFixed(1)}%` : '—',
                      },
                    ].map((m) => (
                      <div key={m.label}>
                        <div
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            color: 'var(--color-text-tertiary)',
                          }}
                        >
                          {m.label}
                        </div>
                        <div
                          style={{
                            fontSize: 16,
                            fontWeight: 700,
                            color: 'var(--color-text-primary)',
                          }}
                        >
                          {m.value}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    Stage: {project.stage?.replaceAll('_', ' ') ?? '—'} ·{' '}
                    {result.sale_date ? `Target close ${fmtYM(result.sale_date)}` : 'No close date'}
                  </div>
                </Link>
              );
            })}
          </Section>
        )}
        {top2Committed.length > 0 && committed.length > 2 && (
          <Link
            href="/projects?filter=committed"
            style={{
              display: 'inline-block',
              marginTop: -12,
              paddingLeft: 4,
              fontSize: 12,
              color: 'var(--color-text-secondary)',
              textDecoration: 'none',
            }}
          >
            +{committed.length - 2} more committed projects →
          </Link>
        )}
        {top2Committed.length === 0 && (
          <div
            style={{
              ...card,
              textAlign: 'center',
              padding: 28,
              color: 'var(--color-text-tertiary)',
              fontSize: 13,
            }}
          >
            No committed projects yet — advance a prospect in{' '}
            <Link href="/pipeline" style={{ color: 'var(--color-text-secondary)' }}>
              Pipeline
            </Link>{' '}
            to populate this row.
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
