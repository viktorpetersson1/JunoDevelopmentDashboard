/**
 * /pricing — Market Intelligence Dashboard (D-026 — unified layout).
 *
 * Layout (top to bottom):
 *   1. Page header with action pills (Quick price · Comp library · Pick a project)
 *   2. <MarketIntel /> — unified card: filter chips + refresh + KPIs + bar chart + recent comps
 *   3. Active project recommendations — tile grid of every project's current brief
 *
 * The Server Component does one bulk fetch of dashboard comps (closed in
 * window + prior-year window + active) and hands them to the Client Component
 * which owns filter state.
 */

import Link from 'next/link';
import { DashboardShell } from '../_components/dashboard-shell';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';
import { countComps, getCompsForDashboard } from '@/lib/repos/comps';
import { findMarketByKey } from '@/lib/repos/markets';
import {
  listAllCurrentBriefs,
  type CurrentBriefForDashboard,
} from '@/lib/repos/pricing-briefs';
import { MarketIntel } from './_components/market-intel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export default async function PricingDashboardPage() {
  const { profile, user } = await requireAuthOrRedirect('/pricing');
  const canEdit = hasRole(profile, ['super_admin', 'editor']);

  const [market, dashboardComps, currentBriefs, totalComps] = await Promise.all([
    findMarketByKey('east_end_li'),
    getCompsForDashboard(90),
    listAllCurrentBriefs(),
    countComps(false),
  ]);

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  return (
    <DashboardShell activeHref="/pricing" user={dashboardUser}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PageHeader canEdit={canEdit} />
        <MarketIntel
          canEdit={canEdit}
          windowDays={dashboardComps.windowDays}
          closedInWindow={dashboardComps.closedInWindow}
          priorClosedInWindow={dashboardComps.priorClosedInWindow}
          activeAll={dashboardComps.activeAll}
          subCuts={market?.subCuts ?? []}
          totalCompsInLibrary={totalComps}
        />
        <ActiveBriefs briefs={currentBriefs} subCutLabels={subCutLabelMap(market?.subCuts ?? [])} />
      </div>
    </DashboardShell>
  );
}

function subCutLabelMap(
  subCuts: { key: string; label: string }[]
): Map<string, string> {
  const m = new Map<string, string>();
  for (const sc of subCuts) m.set(sc.key, sc.label);
  return m;
}

// ────────────────────────────────────────────────────────────────────────────
// Page header — title + small action pills, top-right
// ────────────────────────────────────────────────────────────────────────────

function PageHeader({ canEdit }: { canEdit: boolean }) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: '-0.025em',
            color: 'var(--color-text-primary, #111)',
          }}
        >
          Pricing
        </h1>
        <p
          style={{
            margin: '4px 0 0',
            fontSize: 13,
            color: 'var(--color-text-secondary, #6b7280)',
          }}
        >
          Market intelligence and active project pricing recommendations.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canEdit && (
          <Link
            href="/pricing/new"
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: '8px 14px',
              borderRadius: 8,
              background: 'var(--color-accent-base, #131313)',
              color: '#fff',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Quick price →
          </Link>
        )}
        <Link
          href="/pricing/comps"
          style={{
            fontSize: 13,
            fontWeight: 500,
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid var(--color-border-hairline, #c8c8c5)',
            background: 'var(--color-surface-base, #fff)',
            color: 'var(--color-text-primary, #111)',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Comp library
        </Link>
        <Link
          href="/projects"
          style={{
            fontSize: 13,
            fontWeight: 500,
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid var(--color-border-hairline, #c8c8c5)',
            background: 'var(--color-surface-base, #fff)',
            color: 'var(--color-text-primary, #111)',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Pick a project
        </Link>
      </div>
    </header>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Active project recommendations — tile grid
// ────────────────────────────────────────────────────────────────────────────

function ActiveBriefs({
  briefs,
  subCutLabels,
}: {
  briefs: CurrentBriefForDashboard[];
  subCutLabels: Map<string, string>;
}) {
  void subCutLabels;
  return (
    <Card>
      <SectionHeader
        label="Active project recommendations"
        badge={`${briefs.length} ${briefs.length === 1 ? 'project' : 'projects'}`}
      />
      {briefs.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: 'var(--color-text-tertiary, #767b84)',
            lineHeight: 1.5,
          }}
        >
          No project briefs yet. Open any project&apos;s Pricing tab and click Generate
          recommendation.
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 12,
          }}
        >
          {briefs.map((b) => (
            <BriefTile key={b.id} brief={b} />
          ))}
        </div>
      )}
    </Card>
  );
}

function BriefTile({ brief }: { brief: CurrentBriefForDashboard }) {
  const isApplied = brief.status === 'applied';
  const isFailed = brief.status === 'failed' || !!brief.generationError;
  const isDraft = brief.status === 'draft';
  const ageDays = Math.floor(
    (Date.now() - new Date(brief.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  const isStale = ageDays > 30;

  const launchUsd = brief.recommendedLaunchPriceUsd;
  const margin = brief.expectedMarginPct;

  return (
    <Link
      href={`/projects/${brief.projectKey}?tab=pricing`}
      style={{
        textDecoration: 'none',
        background: isFailed
          ? 'var(--color-surface-sunken, #fafaf8)'
          : 'var(--color-surface-base, #fff)',
        border: '1px solid var(--color-border-hairline, #c8c8c5)',
        borderRadius: 10,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        color: 'inherit',
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--color-text-primary, #111)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {brief.projectName}
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--color-text-tertiary, #767b84)',
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ textTransform: 'capitalize' }}>
          {brief.projectMarketId.replaceAll('_', ' ')}
        </span>
        <span>·</span>
        <span>v{brief.version}</span>
        <span>·</span>
        <span>{ageDays === 0 ? 'today' : `${ageDays}d ago`}</span>
      </div>
      {isFailed ? (
        <div
          style={{
            fontSize: 12,
            color: 'var(--color-warning, #a16207)',
            marginTop: 4,
          }}
        >
          Generation failed — refresh from project page
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            marginTop: 4,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: 'var(--color-text-primary, #111)',
              letterSpacing: '-0.01em',
            }}
          >
            {launchUsd ? compactUsd(launchUsd) : '—'}
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: marginColor(margin),
            }}
          >
            {margin !== null ? formatPct(margin) : '—'}
          </span>
        </div>
      )}
      <StatusPip
        tone={isApplied ? 'positive' : isStale ? 'warning' : isDraft ? 'info' : 'neutral'}
        label={
          isApplied
            ? 'Applied'
            : isStale
              ? 'Stale (>30d)'
              : isDraft
                ? 'Draft'
                : brief.status
        }
      />
    </Link>
  );
}

function StatusPip({
  tone,
  label,
}: {
  tone: 'positive' | 'info' | 'warning' | 'neutral';
  label: string;
}) {
  const color =
    tone === 'positive'
      ? 'var(--color-positive, #15803d)'
      : tone === 'info'
        ? 'var(--color-accent-blue, #4f6fff)'
        : tone === 'warning'
          ? 'var(--color-warning, #a16207)'
          : 'var(--color-text-quaternary, #b0b5bc)';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        color: 'var(--color-text-secondary, #6b7280)',
        textTransform: 'capitalize',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: color,
          display: 'inline-block',
        }}
        aria-hidden
      />
      {label}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Shared primitives (only ones still used at the page level)
// ────────────────────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--color-surface-raised, #fff)',
        border: '1px solid var(--color-border-hairline, #c8c8c5)',
        borderRadius: 12,
        padding: 16,
      }}
    >
      {children}
    </div>
  );
}

function SectionHeader({ label, badge }: { label: string; badge?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
        marginBottom: 12,
        flexWrap: 'wrap',
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--color-text-primary, #111)',
        }}
      >
        {label}
      </h2>
      {badge && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--color-text-tertiary, #767b84)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Format helpers (used by BriefTile)
// ────────────────────────────────────────────────────────────────────────────

function compactUsd(n: number | null | undefined): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`;
  }
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function formatPct(n: number | null): string {
  if (n === null) return '—';
  const v = n * 100;
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

function marginColor(m: number | null | undefined): string {
  if (m == null) return 'var(--color-text-tertiary, #767b84)';
  if (m >= 0.10) return 'var(--color-positive, #15803d)';
  if (m >= 0) return 'var(--color-warning, #a16207)';
  return 'var(--color-negative, #b91c1c)';
}
