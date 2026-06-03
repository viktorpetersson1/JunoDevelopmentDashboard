/**
 * Surface 04 + 05 — Project detail shell + Summary tab default.
 *
 * Server Component: auth + repo lookup by project_key + runProject(); hands
 * tab content to ProjectDetailClient (which owns the tab router state).
 *
 * Pixel target: 04_project.png + 05_project-summary.png ≤ 5% (T051).
 */

import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { ProjectDetailClient } from './_components/project-detail-client';
import { SummaryTab } from './_components/summary-tab';
import { TimelineTab } from './_components/timeline-tab';
import { CapitalTab } from './_components/capital-tab';
import { ActualsTab } from './_components/actuals-tab';
import { SalesTab } from './_components/sales-tab';
import { SalesEditorModal } from './_components/sales-editor-modal';
import { RisksTab } from './_components/risks-tab';
import { findRisksByProject } from '@/lib/repos/project-risks';
import { ActivityTab } from './_components/activity-tab';
import { InputsTab } from './_components/inputs-tab';
import { PricingStrategyTab } from './_components/pricing-strategy-tab';
import { findCurrentBrief, listBriefs } from '@/lib/repos/pricing-briefs';
import { SnapshotBanner } from './_components/snapshot-banner';
import {
  findCurrentProjectByKey,
  findCurrentProjectUuidByKey,
  findManyProjects,
} from '@/lib/repos/project';
import { findCapitalCallsByProject } from '@/lib/repos/capital-call';
import {
  findLatestLockedSnapshot,
  findLatestSnapshot,
  findSnapshotsByProject,
} from '@/lib/repos/approval-snapshot';
import { findAuditForProject } from '@/lib/repos/audit-log';
import { inputsDrifted } from '@/lib/projects/reapproval';
import { listActualsByCategory } from '@/lib/services/actuals';
import { fetchAllProfiles, fetchCapTable } from '@/lib/repos/settings';
import { enrichWithAppliedPricingRun } from '@/lib/services/project-with-pricing';
import { runProject } from '@/lib/calc/project/runProject';
import { buildProjectPnL, allocateOwnerEarnings } from '@/lib/finance/project-pnl';
import { computeRolloutTrigger } from '@/lib/finance/rollout-trigger';
import { debtSnapshotForMonth } from '@/lib/finance/project-cashflow';
import { getActiveGlobals } from '@/lib/globals/active';
import { BASELINE_GLOBALS, BASELINE_SCENARIO } from '@/lib/calc/baselines';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const { profile, user } = await requireAuthOrRedirect(`/projects/${params.id}`);
  const project = await findCurrentProjectByKey(params.id);
  if (!project) notFound();

  // D-016: if this project has an applied pricing run, enrich the input
  // with plot_exits so the calc engine sees the framework numbers. Pure
  // no-op for projects without an applied run (10 baselines unchanged).
  const projectUuidForPricing = await findCurrentProjectUuidByKey(params.id);
  const enrichedProject = await enrichWithAppliedPricingRun(project, projectUuidForPricing);
  const result = runProject(enrichedProject, BASELINE_GLOBALS, BASELINE_SCENARIO);

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  const tab = searchParams.tab ?? 'summary';

  // All 8 tabs live. Inputs/Capital/Risks render the data the calc engine
  // already produces; Actuals/Activity show empty-state shells pending
  // T060 + T069 ingest paths.
  let tabContent: ReactNode;
  switch (tab) {
    case 'summary': {
      // V5.2 T093.2 — 9-line P&L (per-project tax + closing memo) + owner
      // earnings split. The per-owner breakdown is sensitive (D-011), so it's
      // admin-only — same gate as the cap table on the Capital tab.
      const pnl = buildProjectPnL(result, {
        taxRatePct: enrichedProject.tax_rate_pct,
        closingCostsUsd: enrichedProject.closing_costs_usd,
      });
      const canSeeOwnerSplit = hasRole(profile, ['super_admin', 'editor']);
      const ownerEarnings = canSeeOwnerSplit
        ? allocateOwnerEarnings(
            pnl.net_profit_after_tax_usd,
            (await fetchCapTable()).map((c) => ({
              key: c.ownerKey,
              displayName: c.displayName,
              shareBps: c.shareBps,
            }))
          )
        : null;
      // Rollout pacing (T093.7) — portfolio NPAT vs the exec target (active
      // globals). Cheap: ~10 projects × runProject (~0.2ms each). today_month
      // comes from the server clock so computeRolloutTrigger stays pure.
      const { projects: portfolio } = await findManyProjects({ limit: 100 });
      const { globals } = await getActiveGlobals();
      const rollout = computeRolloutTrigger({
        projects: portfolio.map((p) => {
          const r = runProject(p, globals, BASELINE_SCENARIO);
          return {
            project_id: p.id,
            recognition_month: r.sale_date,
            npat_usd: buildProjectPnL(r, { taxRatePct: p.tax_rate_pct }).net_profit_after_tax_usd,
          };
        }),
        target_annual_npat_usd: globals.target_annual_npat_usd ?? null,
        fixed_overhead_annual_usd: globals.fixed_overhead_annual_usd,
        project_time_to_npat_months: globals.project_time_to_npat_months ?? 18,
        today_month: serverMonthYM(),
      });
      // "What we owe today" (T094.2) — engine forecast at the current month
      // (no actuals ingest path yet).
      const debtSnapshot = debtSnapshotForMonth(result.monthly, serverMonthYM());
      tabContent = (
        <SummaryTab
          project={enrichedProject}
          result={result}
          pnl={pnl}
          ownerEarnings={ownerEarnings}
          rollout={rollout}
          debtSnapshot={debtSnapshot}
        />
      );
      break;
    }
    case 'timeline':
      tabContent = <TimelineTab project={project} result={result} />;
      break;
    case 'capital': {
      // Capital tab needs real capital-call data — fetch DB uuid for the
      // project (capital_calls reference by uuid, not project_key) +
      // owner-scoped calls + cap table for the create-call modal.
      const projectUuid = await findCurrentProjectUuidByKey(params.id);
      const isAdmin = hasRole(profile, ['super_admin', 'editor']);
      const ownerId = isAdmin ? undefined : await resolveOwnerIdForUser(profile.email);
      const calls = projectUuid ? await findCapitalCallsByProject(projectUuid, { ownerId }) : [];
      const capTable = isAdmin ? await fetchCapTable() : [];
      tabContent = (
        <CapitalTab
          result={result}
          projectUuid={projectUuid}
          calls={calls}
          capTable={capTable}
          isAdmin={isAdmin}
        />
      );
      break;
    }
    case 'actuals': {
      const actualsProjectUuid = await findCurrentProjectUuidByKey(params.id);
      const { byCategory, totalCents } = actualsProjectUuid
        ? await listActualsByCategory(actualsProjectUuid)
        : { byCategory: [], totalCents: 0 };
      tabContent = (
        <ActualsTab
          result={result}
          projectUuid={actualsProjectUuid}
          projectKey={params.id}
          byCategory={byCategory}
          totalCents={totalCents}
          isEditor={hasRole(profile, ['super_admin', 'editor'])}
        />
      );
      break;
    }
    case 'sales': {
      const isEditorForSales = hasRole(profile, ['super_admin', 'editor']);
      tabContent = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isEditorForSales && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <SalesEditorModal
                projectKey={params.id}
                project={project}
                isEditor={isEditorForSales}
              />
            </div>
          )}
          <SalesTab project={project} result={result} />
        </div>
      );
      break;
    }
    case 'risks': {
      const risksProjectUuid = await findCurrentProjectUuidByKey(params.id);
      const latestLocked = risksProjectUuid
        ? await findLatestLockedSnapshot(risksProjectUuid)
        : null;
      const risksList = risksProjectUuid
        ? await findRisksByProject(risksProjectUuid)
        : [];
      tabContent = (
        <RisksTab
          result={result}
          latestLockedSnapshot={latestLocked}
          risks={risksList}
          isEditor={hasRole(profile, ['super_admin', 'editor'])}
          projectKey={params.id}
        />
      );
      break;
    }
    case 'activity': {
      const projectUuidForAudit = await findCurrentProjectUuidByKey(params.id);
      const projectCalls = projectUuidForAudit
        ? await findCapitalCallsByProject(projectUuidForAudit, { includeArchived: true })
        : [];
      const projectSnaps = projectUuidForAudit
        ? await findSnapshotsByProject(projectUuidForAudit, { includeArchived: true })
        : [];
      const auditEntries = await findAuditForProject({
        projectKey: params.id,
        capitalCallIds: projectCalls.map((c) => c.id),
        snapshotIds: projectSnaps.map((s) => s.id),
        limit: 100,
      });
      // User display-name lookup for the feed.
      const userIds = new Set<string>();
      for (const e of auditEntries) if (e.userId) userIds.add(e.userId);
      const userDisplayNames: Record<string, string> = {};
      if (userIds.size > 0) {
        const profiles = await fetchAllProfiles();
        for (const p of profiles) {
          if (userIds.has(p.id)) {
            userDisplayNames[p.id] = p.displayName ?? p.email ?? p.id.slice(0, 8);
          }
        }
      }
      tabContent = (
        <ActivityTab
          project={project}
          auditEntries={auditEntries}
          userDisplayNames={userDisplayNames}
        />
      );
      break;
    }
    case 'inputs':
      tabContent = (
        <InputsTab
          project={project}
          projectKey={params.id}
          isEditor={hasRole(profile, ['super_admin', 'editor'])}
        />
      );
      break;
    case 'pricing': {
      // D-025a: replaced the bottoms-up L/B/H pricing-runs UX with a
      // top-down Strategy Brief. Old PricingTab import + listRunsByProject
      // are kept around in case we need to roll back; the new flow only
      // reads from atlas.pricing_briefs.
      const pricingProjectUuid = await findCurrentProjectUuidByKey(params.id);
      const [currentBrief, briefHistory] = pricingProjectUuid
        ? await Promise.all([findCurrentBrief(pricingProjectUuid), listBriefs(pricingProjectUuid)])
        : [null, []];

      tabContent = (
        <PricingStrategyTab
          projectKey={params.id}
          currentBrief={currentBrief}
          briefHistory={briefHistory}
          isEditor={hasRole(profile, ['super_admin', 'editor'])}
          hasAddress={Boolean(
            project.address &&
              project.address.trim() &&
              project.address.trim().toUpperCase() !== 'TBC'
          )}
        />
      );
      break;
    }
    default:
      tabContent = <UnknownTabPlaceholder tab={tab} />;
  }

  const marketLabel =
    project.market && project.market !== 'default' ? project.market.replaceAll('_', ' ') : null;
  const subtitle = [project.address, marketLabel, project.entity_spv].filter(Boolean).join(' · ');

  // Snapshot banner data (loaded for every tab so the gate is always
  // visible). Approver-name lookup uses the existing settings repo so we
  // don't add a new query path.
  const projectUuid = await findCurrentProjectUuidByKey(params.id);
  const latestSnapshot = projectUuid ? await findLatestSnapshot(projectUuid) : null;
  // Re-approval gate (T104 E3): a locked snapshot + drifted inputs = the
  // project needs a fresh snapshot before its numbers are board-trusted again.
  const latestLocked = projectUuid ? await findLatestLockedSnapshot(projectUuid) : null;
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

  return (
    <ProjectDetailClient user={dashboardUser} projectName={project.name} projectSubtitle={subtitle}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SnapshotBanner
          projectKey={params.id}
          latest={latestSnapshot}
          currentUserId={user.id}
          isEditor={hasRole(profile, ['super_admin', 'editor'])}
          isSuperAdmin={hasRole(profile, ['super_admin'])}
          approverNames={approverNames}
          pendingReapproval={pendingReapproval}
          lockedSnapshotDate={latestLocked?.lockedAt ?? null}
        />
        {tabContent}
      </div>
    </ProjectDetailClient>
  );
}

/** Email-match lookup so viewer/viewer_basic see only their own commitments. */
async function resolveOwnerIdForUser(
  email: string | null | undefined
): Promise<string | undefined> {
  if (!email) return undefined;
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('owners')
    .select('id')
    .eq('email', email)
    .eq('is_archived', false)
    .maybeSingle();
  if (error || !data) return undefined;
  return (data as { id: string }).id;
}

/** Current month as YYYY-MM from the server clock. computeRolloutTrigger is
 *  pure (it takes "today" as an argument), so the impurity is isolated here. */
function serverMonthYM(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function UnknownTabPlaceholder({ tab }: { tab: string }) {
  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        background: 'var(--ja-card-bg)',
        border: 'var(--ja-card-border)',
        borderRadius: 'var(--ja-card-radius)',
        color: 'var(--color-text-secondary)',
      }}
    >
      <p style={{ margin: 0, fontSize: 14 }}>
        Unknown tab <code>{tab}</code>. Try Summary, Inputs, Timeline, Capital, Actuals, Sales,
        Risks, or Activity.
      </p>
    </div>
  );
}
