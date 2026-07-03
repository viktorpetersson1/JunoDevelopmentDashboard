/**
 * V7 T140 — opportunity detail: standardized metrics header + Research area
 * (freeform notes, link list, decision log — jsonb on the row, no new
 * tables). "Ask Juno to draft key metrics" renders disabled until T145
 * wires it. T141: "Promote to project" pre-fills the T138 form; promoted
 * records are read-only.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { DashboardShell } from '@/app/_components/dashboard-shell';
import { ResearchPanel } from './_components/research-panel';
import { findOpportunityById } from '@/lib/repos/opportunities';
import { capitalEfficiency } from '@/lib/pipeline/opportunity-ranking';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';
import type { CSSProperties } from 'react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

const card: CSSProperties = {
  background: 'var(--ja-card-bg)',
  border: 'var(--ja-card-border)',
  borderRadius: 'var(--ja-card-radius)',
  padding: 'var(--ja-card-padding)',
};

function money(usd: number | null): string {
  if (usd === null) return '—';
  const abs = Math.abs(usd);
  if (abs >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(usd / 1_000).toFixed(0)}k`;
  return `$${Math.round(usd)}`;
}

export default async function OpportunityDetailPage({ params }: { params: { id: string } }) {
  const { profile, user } = await requireAuthOrRedirect(`/pipeline/opportunities/${params.id}`);
  const opp = await findOpportunityById(params.id);
  if (!opp) notFound();

  const isEditor = hasRole(profile, ['super_admin', 'editor']);
  const isPromoted = opp.status === 'promoted';
  const eff = capitalEfficiency(opp);

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  const metrics: Array<{ label: string; value: string; hint?: string }> = [
    { label: 'Cash needed', value: money(opp.cashNeededUsd) },
    {
      label: 'Timeline',
      value: opp.timelineMonths !== null ? `${opp.timelineMonths} mo` : '—',
      hint: 'to cash-back',
    },
    { label: 'Expected profit', value: money(opp.expectedProfitUsd) },
    {
      label: 'Expected margin',
      value: opp.expectedMarginPct !== null ? `${opp.expectedMarginPct.toFixed(1)}%` : '—',
    },
    { label: 'Capital efficiency', value: eff !== null ? `${eff.toFixed(2)}×` : '—' },
  ];

  return (
    <DashboardShell activeHref="/pipeline" user={dashboardUser}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ja-section-gap)' }}>
        {/* Header */}
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
                {opp.name}
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
                  color:
                    opp.status === 'passed'
                      ? 'var(--color-text-tertiary)'
                      : 'var(--color-text-secondary)',
                }}
              >
                {opp.status}
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
              {[
                opp.market?.replaceAll('_', ' '),
                opp.ownerName ? `owner ${opp.ownerName}` : null,
                opp.source,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* T145 wires this — disabled with tooltip until then. */}
            <button
              type="button"
              disabled
              title="Coming with the pipeline research assistant (T145)"
              style={{
                padding: '7px 14px',
                fontSize: 12.5,
                borderRadius: 8,
                border: '1px solid var(--color-border-hairline)',
                background: 'var(--color-surface-base)',
                color: 'var(--color-text-tertiary)',
                cursor: 'not-allowed',
              }}
            >
              Ask Juno to draft key metrics
            </button>
            {isEditor && !isPromoted && opp.status !== 'passed' && (
              <Link
                href={`/projects/new?fromOpportunity=${opp.id}`}
                style={{
                  padding: '7px 14px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  borderRadius: 8,
                  background: 'var(--color-cta, #131313)',
                  color: 'var(--color-text-inverse, #ffffff)',
                  textDecoration: 'none',
                }}
              >
                Promote to project
              </Link>
            )}
            {isPromoted && opp.promotedProjectId && (
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                Promoted — record is read-only
              </span>
            )}
          </div>
        </header>

        {/* Metrics header */}
        <section style={card}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 12,
            }}
          >
            {metrics.map((m) => (
              <div key={m.label}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  {m.label}
                </div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    marginTop: 3,
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {m.value}
                </div>
                {m.hint && (
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{m.hint}</div>
                )}
              </div>
            ))}
          </div>
          {(opp.nextStep || opp.notes) && (
            <div
              style={{
                marginTop: 14,
                paddingTop: 12,
                borderTop: '1px solid var(--color-border-subtle)',
                fontSize: 13,
                color: 'var(--color-text-secondary)',
              }}
            >
              {opp.nextStep && (
                <p style={{ margin: 0 }}>
                  <strong style={{ color: 'var(--color-text-primary)' }}>Next step:</strong>{' '}
                  {opp.nextStep}
                  {opp.nextStepOwner ? ` (${opp.nextStepOwner})` : ''}
                </p>
              )}
              {opp.notes && <p style={{ margin: opp.nextStep ? '6px 0 0' : 0 }}>{opp.notes}</p>}
            </div>
          )}
        </section>

        {/* Research */}
        <section style={card}>
          <ResearchPanel
            opportunityId={opp.id}
            research={opp.research}
            readOnly={!isEditor || isPromoted}
          />
        </section>
      </div>
    </DashboardShell>
  );
}
