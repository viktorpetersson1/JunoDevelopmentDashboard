/**
 * /pricing — Market Intelligence Dashboard (D-026).
 *
 * Replaces the prior "Exit Pricing Framework landing" (empty-state hub with
 * 3 big action cards + sub-cut taxonomy). The new surface treats `/pricing`
 * as a portfolio-wide pricing intelligence view:
 *
 *   1. Compact action row (top-right)        — Quick price · Comp library · Pick a project
 *   2. Market Pulse (KPI strip, 90-day)      — avg PSF, median DOM, closed, active + YoY
 *   3. $/SF by sub-market (bar chart)        — median PSF per sub-cut, sorted desc
 *   4. Active project recommendations         — tile grid of all current pricing briefs
 *   5. Recent comp activity (last 10 closed)  — quick scan of just-closed sales
 *
 * Data sources:
 *   - atlas.comps (auto-saved from AI research + manual entries)
 *   - atlas.pricing_briefs (latest per project)
 *
 * Server Component. All sections degrade gracefully when the library is empty.
 */

import Link from 'next/link';
import { DashboardShell } from '../_components/dashboard-shell';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';
import {
  getMarketKpis,
  getPsfBySubCut,
  getRecentClosedComps,
  countComps,
  type CompView,
  type MarketKpis,
  type SubCutPsf,
} from '@/lib/repos/comps';
import { findMarketByKey } from '@/lib/repos/markets';
import {
  listAllCurrentBriefs,
  type CurrentBriefForDashboard,
} from '@/lib/repos/pricing-briefs';
import { RefreshMarketButton } from './_components/refresh-market-button';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export default async function PricingDashboardPage() {
  const { profile, user } = await requireAuthOrRedirect('/pricing');
  const canEdit = hasRole(profile, ['super_admin', 'editor']);

  const [market, kpis, psfBySubCut, recentComps, currentBriefs, totalComps] =
    await Promise.all([
      findMarketByKey('east_end_li'),
      getMarketKpis(90),
      getPsfBySubCut(90),
      getRecentClosedComps(10),
      listAllCurrentBriefs(),
      countComps(false),
    ]);

  const subCutLabelMap = new Map<string, string>();
  for (const sc of market?.subCuts ?? []) {
    subCutLabelMap.set(sc.key, sc.label);
  }

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  return (
    <DashboardShell activeHref="/pricing" user={dashboardUser}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PageHeader canEdit={canEdit} />
        <MarketPulse kpis={kpis} totalComps={totalComps} canEdit={canEdit} />
        <PsfBySubCut rows={psfBySubCut} labelMap={subCutLabelMap} />
        <ActiveBriefs briefs={currentBriefs} />
        <RecentActivity comps={recentComps} labelMap={subCutLabelMap} />
      </div>
    </DashboardShell>
  );
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
// Market Pulse — 4 KPI tiles (last 90 days) with YoY indicators
// ────────────────────────────────────────────────────────────────────────────

function MarketPulse({
  kpis,
  totalComps,
  canEdit,
}: {
  kpis: MarketKpis;
  totalComps: number;
  canEdit: boolean;
}) {
  const psfDelta =
    kpis.avgPsfUsd !== null && kpis.prior.avgPsfUsd !== null && kpis.prior.avgPsfUsd > 0
      ? (kpis.avgPsfUsd - kpis.prior.avgPsfUsd) / kpis.prior.avgPsfUsd
      : null;
  const domDelta =
    kpis.medianDomDays !== null &&
    kpis.prior.medianDomDays !== null &&
    kpis.prior.medianDomDays > 0
      ? (kpis.medianDomDays - kpis.prior.medianDomDays) / kpis.prior.medianDomDays
      : null;
  const closedDelta =
    kpis.prior.closedCount > 0
      ? (kpis.closedCount - kpis.prior.closedCount) / kpis.prior.closedCount
      : null;

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <SectionHeader
          label="Market pulse"
          badge={`last ${kpis.windowDays} days · ${totalComps} comps in library`}
        />
        {canEdit && <RefreshMarketButton />}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
        }}
      >
        <KpiTile
          label="Avg $/SF"
          value={kpis.avgPsfUsd !== null ? `$${kpis.avgPsfUsd.toLocaleString()}` : '—'}
          deltaPct={psfDelta}
          deltaTone="higher-better"
          sub={kpis.avgPsfUsd === null ? 'no closed comps in window' : 'closed comps, weighted'}
        />
        <KpiTile
          label="Median DOM"
          value={kpis.medianDomDays !== null ? `${kpis.medianDomDays} d` : '—'}
          deltaPct={domDelta}
          deltaTone="lower-better"
          sub={kpis.medianDomDays === null ? 'no DOM data yet' : 'days on market'}
        />
        <KpiTile
          label="Closed sales"
          value={kpis.closedCount.toLocaleString()}
          deltaPct={closedDelta}
          deltaTone="higher-better"
          sub="in window"
        />
        <KpiTile
          label="Active listings"
          value={kpis.activeCount.toLocaleString()}
          sub="currently on market"
        />
      </div>
    </Card>
  );
}

function KpiTile({
  label,
  value,
  deltaPct,
  deltaTone,
  sub,
}: {
  label: string;
  value: string;
  deltaPct?: number | null;
  deltaTone?: 'higher-better' | 'lower-better';
  sub?: string;
}) {
  const hasDelta = deltaPct !== null && deltaPct !== undefined && Number.isFinite(deltaPct);
  let deltaColor = 'var(--color-text-tertiary, #767b84)';
  if (hasDelta && deltaTone) {
    const positive = deltaPct! > 0;
    const good =
      (deltaTone === 'higher-better' && positive) ||
      (deltaTone === 'lower-better' && !positive);
    deltaColor = good
      ? 'var(--color-positive, #15803d)'
      : 'var(--color-negative, #b91c1c)';
  }

  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-tertiary, #767b84)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          marginTop: 4,
          color: 'var(--color-text-primary, #111)',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.15,
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 11,
          color: 'var(--color-text-tertiary, #767b84)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {hasDelta && (
          <span style={{ color: deltaColor, fontWeight: 600, marginRight: 6 }}>
            {deltaPct! > 0 ? '▲' : deltaPct! < 0 ? '▼' : '·'}{' '}
            {Math.abs(deltaPct! * 100).toFixed(1)}% YoY
          </span>
        )}
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// $/SF by sub-market — horizontal bar chart
// ────────────────────────────────────────────────────────────────────────────

function PsfBySubCut({
  rows,
  labelMap,
}: {
  rows: SubCutPsf[];
  labelMap: Map<string, string>;
}) {
  const maxPsf = Math.max(...rows.map((r) => r.medianPsfUsd ?? 0), 1);

  return (
    <Card>
      <SectionHeader label="$/SF by sub-market" badge="median closed, last 90 d" />
      {rows.length === 0 ? (
        <EmptyHint copy="No closed comps in window — bar chart will populate as briefs auto-save AI-researched comps to the library." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((r) => {
            const label = labelMap.get(r.subCutKey) ?? r.subCutKey;
            const widthPct = r.medianPsfUsd
              ? Math.max(2, (r.medianPsfUsd / maxPsf) * 100)
              : 0;
            return (
              <div
                key={r.subCutKey}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(180px, 1fr) 3fr minmax(120px, auto)',
                  gap: 12,
                  alignItems: 'center',
                  fontSize: 12,
                }}
              >
                <span
                  style={{
                    color: 'var(--color-text-primary, #111)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </span>
                <div
                  style={{
                    position: 'relative',
                    height: 18,
                    background: 'var(--color-surface-base, #fff)',
                    border: '1px solid var(--color-border-hairline, #c8c8c5)',
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${widthPct}%`,
                      background: 'var(--color-accent-base, #131313)',
                      transition: 'width 200ms ease',
                    }}
                  />
                </div>
                <span
                  style={{
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--color-text-primary, #111)',
                    fontWeight: 600,
                    textAlign: 'right',
                  }}
                >
                  ${r.medianPsfUsd?.toLocaleString()}{' '}
                  <span
                    style={{
                      fontWeight: 400,
                      color: 'var(--color-text-tertiary, #767b84)',
                    }}
                  >
                    · {r.closedCount}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Active project recommendations — tile grid
// ────────────────────────────────────────────────────────────────────────────

function ActiveBriefs({ briefs }: { briefs: CurrentBriefForDashboard[] }) {
  return (
    <Card>
      <SectionHeader
        label="Active project recommendations"
        badge={`${briefs.length} ${briefs.length === 1 ? 'project' : 'projects'}`}
      />
      {briefs.length === 0 ? (
        <EmptyHint copy="No project briefs yet. Open any project's Pricing tab and click Generate recommendation." />
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
// Recent comp activity — last 10 closed comps
// ────────────────────────────────────────────────────────────────────────────

function RecentActivity({
  comps,
  labelMap,
}: {
  comps: CompView[];
  labelMap: Map<string, string>;
}) {
  return (
    <Card>
      <SectionHeader label="Recent closed comps" badge={`last ${comps.length}`} />
      {comps.length === 0 ? (
        <EmptyHint copy="No closed comps in the library yet. Run a Quick Price or generate a project brief — AI-researched comps will auto-save here." />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)',
                }}
              >
                {['Date', 'Address', 'Sub-market', 'SF', 'Price', '$/SF'].map((h, i) => (
                  <th key={h} style={thStyle(i >= 3 ? 'right' : 'left')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comps.map((c) => {
                const subCutLabel = labelMap.get(c.subCutKey) ?? c.subCutKey;
                return (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)',
                    }}
                  >
                    <td style={tdStyle('left', { tertiary: true })}>
                      {c.closingDate ?? '—'}
                    </td>
                    <td style={tdStyle()}>{c.address}</td>
                    <td style={tdStyle('left', { tertiary: true })}>{subCutLabel}</td>
                    <td style={tdStyle('right', { tabular: true })}>
                      {c.agSqft.toLocaleString()}
                    </td>
                    <td style={tdStyle('right', { tabular: true })}>
                      {c.salePriceCents !== null
                        ? compactUsd(c.salePriceCents / 100)
                        : '—'}
                    </td>
                    <td
                      style={tdStyle('right', { tabular: true, strong: true })}
                    >
                      {c.psf ? `$${Math.round(c.psf).toLocaleString()}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Shared primitives
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

function EmptyHint({ copy }: { copy: string }) {
  return (
    <p
      style={{
        margin: 0,
        fontSize: 12,
        color: 'var(--color-text-tertiary, #767b84)',
        lineHeight: 1.5,
      }}
    >
      {copy}
    </p>
  );
}

function thStyle(align: 'left' | 'right'): React.CSSProperties {
  return {
    padding: '6px 10px',
    textAlign: align,
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--color-text-tertiary, #767b84)',
    whiteSpace: 'nowrap',
  };
}
function tdStyle(
  align: 'left' | 'right' = 'left',
  opts: { tabular?: boolean; strong?: boolean; tertiary?: boolean } = {}
): React.CSSProperties {
  return {
    padding: '6px 10px',
    textAlign: align,
    color: opts.tertiary
      ? 'var(--color-text-tertiary, #767b84)'
      : 'var(--color-text-primary, #111)',
    fontWeight: opts.strong ? 600 : 400,
    fontVariantNumeric: opts.tabular ? 'tabular-nums' : undefined,
    whiteSpace: 'nowrap',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Format helpers
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
