/**
 * V7 T136 — Project page = 4 exec blocks.
 *
 * The 9-tab TabbedPage is gone: one scrolling Server Component with the four
 * blocks an exec actually reads, all from ONE engine run on the SAME globals
 * + scenario Home uses (Rule 1 — the parity test in
 * lib/calc/__tests__/project-blocks-parity.test.ts locks this):
 *
 *   #program       Program — phase bar, key dates, % elapsed, slippage vs
 *                  the locked plan (amber ≥ 1 mo, red ≥ 3)
 *   #cashflow      Cash flow — monthly in/out + cumulative (existing chart)
 *   #requirements  Cash requirements — equity/senior draws by month, peak
 *                  equity, remaining-to-fund
 *   #pnl           P&L — 9 lines, plan vs actuals-to-date (when booked)
 *
 * Header: name, stage chip, market, SPV, target sale month + "Edit
 * assumptions" (the existing InputsEditor island). Risks = compact top-3
 * list at the bottom. Old ?tab= URLs 308 to the page (+ anchor). The old
 * tab components stay on disk (Rule 4 — park, don't delete).
 */

import { notFound, permanentRedirect } from 'next/navigation';
import { DashboardShell } from '@/app/_components/dashboard-shell';
import { SnapshotBanner } from './_components/snapshot-banner';
import { ProgramBlock } from './_components/program-block';
import { RequirementsBlock } from './_components/requirements-block';
import { PnLBlock } from './_components/pnl-block';
import { CashFlowChart } from './_components/cash-flow-chart';
import { InputsEditor } from './_components/inputs-editor-modal';
import { findRisksByProject } from '@/lib/repos/project-risks';
import { findCurrentProjectByKey, findCurrentProjectUuidByKey } from '@/lib/repos/project';
import { findLatestLockedSnapshot, findLatestSnapshot } from '@/lib/repos/approval-snapshot';
import { inputsDrifted } from '@/lib/projects/reapproval';
import { listActualsByCategory } from '@/lib/services/actuals';
import { fetchAllProfiles } from '@/lib/repos/settings';
import { enrichWithAppliedPricingRun } from '@/lib/services/project-with-pricing';
import { runProject } from '@/lib/calc/project/runProject';
import { buildProjectPnL } from '@/lib/finance/project-pnl';
import { getActiveGlobals } from '@/lib/globals/active';
import { getActiveScenario } from '@/lib/scenarios/active';
import { getCapitalPosition, applyCapitalPositionToGlobals } from '@/lib/treasury/capital-position';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';
import type { CSSProperties } from 'react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

/** Old tab URLs land on the owning block (T136 acceptance). */
const TAB_ANCHORS: Record<string, string> = {
  summary: '',
  inputs: '', // assumptions live in the header drawer now
  timeline: '#program',
  capital: '#requirements',
  actuals: '#pnl',
  sales: '', // listed/UC/closed folded into the header stage chip
  risks: '#risks',
  pricing: '', // pricing surface is parked (T134)
  activity: '', // audit feed parked with /activity
};

const card: CSSProperties = {
  background: 'var(--ja-card-bg)',
  border: 'var(--ja-card-border)',
  borderRadius: 'var(--ja-card-radius)',
  padding: 'var(--ja-card-padding)',
  scrollMarginTop: 80,
};

function serverMonthYM(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  // T136 — one route, no ?tab=. Old tab bookmarks 308 to the page + anchor.
  if (searchParams.tab !== undefined) {
    permanentRedirect(`/projects/${params.id}${TAB_ANCHORS[searchParams.tab] ?? ''}`);
  }

  const { profile, user } = await requireAuthOrRedirect(`/projects/${params.id}`);
  const project = await findCurrentProjectByKey(params.id);
  if (!project) notFound();
  const projectUuid = await findCurrentProjectUuidByKey(params.id);

  // D-016: applied pricing runs enrich the input (no-op otherwise).
  const enrichedProject = await enrichWithAppliedPricingRun(project, projectUuid);

  // T136 (Rule 1): the SAME resolved globals + capital position + scenario
  // Home runs — the per-project blocks sum to the Home aggregates exactly.
  const [globalsCtx, capitalPosition, active] = await Promise.all([
    getActiveGlobals(),
    getCapitalPosition(),
    getActiveScenario(),
  ]);
  const globals = applyCapitalPositionToGlobals(globalsCtx.globals, capitalPosition);
  const result = runProject(enrichedProject, globals, active.scenario);
  const pnl = buildProjectPnL(result, {
    taxRatePct: enrichedProject.tax_rate_pct,
    closingCostsUsd: enrichedProject.closing_costs_usd,
  });

  const [actuals, risks, latestSnapshot, latestLocked] = await Promise.all([
    projectUuid
      ? listActualsByCategory(projectUuid)
      : Promise.resolve({ byCategory: [], totalCents: 0 }),
    projectUuid ? findRisksByProject(projectUuid) : Promise.resolve([]),
    projectUuid ? findLatestSnapshot(projectUuid) : Promise.resolve(null),
    projectUuid ? findLatestLockedSnapshot(projectUuid) : Promise.resolve(null),
  ]);

  const pendingReapproval = !!latestLocked && inputsDrifted(project, latestLocked.computedInputs);
  const approverNames: Record<string, string> = {};
  if (latestSnapshot) {
    const ids = new Set<string>(latestSnapshot.approvedBy);
    if (latestSnapshot.createdBy) ids.add(latestSnapshot.createdBy);
    if (latestSnapshot.lockedBy) ids.add(latestSnapshot.lockedBy);
    if (ids.size > 0) {
      const profiles = await fetchAllProfiles();
      for (const p of profiles) {
        if (ids.has(p.id)) approverNames[p.id] = p.displayName ?? p.email ?? p.id.slice(0, 8);
      }
    }
  }

  const isEditor = hasRole(profile, ['super_admin', 'editor']);
  const todayYM = serverMonthYM();

  // Slippage baseline = the locked plan's FROZEN outputs (no re-run).
  const plannedSaleDate = latestLocked?.computedOutputs.sale_date ?? null;

  // Top-3 open risks by severity (compact list — the full editor is parked).
  const topRisks = risks
    .filter((r) => r.status === 'open')
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
    .slice(0, 3);

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  const marketLabel =
    project.market && project.market !== 'default' ? project.market.replaceAll('_', ' ') : null;
  const stageLabel = (project.stage ?? 'tbc').replaceAll('_', ' ');

  return (
    <DashboardShell
      activeHref="/projects"
      user={dashboardUser}
      activeScenarioClass={active.activeClass}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ja-section-gap)' }}>
        {/* ── Header: name · stage chip · market · SPV · target sale · edit ── */}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  margin: 0,
                  letterSpacing: '-0.025em',
                  color: 'var(--color-text-primary)',
                }}
              >
                {project.name}
              </h1>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  padding: '3px 10px',
                  borderRadius: 999,
                  border: '1px solid var(--color-border-hairline)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {stageLabel}
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
              {[
                project.address,
                marketLabel,
                project.entity_spv,
                result.sale_date ? `target sale ${result.sale_date}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          {isEditor && (
            <InputsEditor projectKey={params.id} project={project} isEditor={isEditor} />
          )}
        </header>

        <SnapshotBanner
          projectKey={params.id}
          latest={latestSnapshot}
          currentUserId={user.id}
          isEditor={isEditor}
          isSuperAdmin={hasRole(profile, ['super_admin'])}
          approverNames={approverNames}
          pendingReapproval={pendingReapproval}
          lockedSnapshotDate={latestLocked?.lockedAt ?? null}
        />

        {/* ── 1. Program ── */}
        <section id="program" style={card}>
          <BlockHeader title="Program" hint="Phase plan, elapsed, slippage vs locked plan" />
          <ProgramBlock
            project={enrichedProject}
            result={result}
            plannedSaleDate={plannedSaleDate}
            todayYM={todayYM}
          />
        </section>

        {/* ── 2. Cash flow ── */}
        <section id="cashflow" style={card}>
          <BlockHeader title="Cash flow" hint="Monthly in/out + cumulative, engine output" />
          <CashFlowChart
            monthly={result.monthly}
            startDate={result.start_date}
            saleDate={result.sale_date}
          />
        </section>

        {/* ── 3. Cash requirements ── */}
        <section id="requirements" style={card}>
          <BlockHeader
            title="Cash requirements"
            hint="When this project needs money, and from where"
          />
          <RequirementsBlock result={result} todayYM={todayYM} />
        </section>

        {/* ── 4. P&L ── */}
        <section id="pnl" style={card}>
          <BlockHeader title="P&L" hint="Plan vs actuals to date" />
          <PnLBlock pnl={pnl} actualsByCategory={actuals.byCategory} />
        </section>

        {/* ── Risks (compact top 3) ── */}
        <section id="risks" style={card}>
          <BlockHeader title="Top risks" hint={`${topRisks.length} of ${risks.length} logged`} />
          {topRisks.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
              No open risks logged for this project.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {topRisks.map((r, i) => (
                <li
                  key={r.id}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 10,
                    padding: '8px 0',
                    borderBottom:
                      i === topRisks.length - 1 ? 'none' : '1px solid var(--color-border-subtle)',
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color:
                        r.severity === 'critical' || r.severity === 'high'
                          ? 'var(--color-negative, #b91c1c)'
                          : 'var(--color-text-tertiary)',
                      minWidth: 64,
                    }}
                  >
                    {r.severity}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--color-text-primary)', flex: 1 }}>
                    {r.risk}
                    {r.mitigation && (
                      <span style={{ color: 'var(--color-text-tertiary)' }}> — {r.mitigation}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}

function BlockHeader({ title, hint }: { title: string; hint?: string }) {
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
