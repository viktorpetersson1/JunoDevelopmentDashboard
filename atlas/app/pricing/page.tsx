/**
 * /pricing — landing surface for the Exit Pricing Framework v1.
 *
 * Summary tiles: comp count, market config snapshot, recent runs.
 * Quick-action buttons to the comp library + (future) project picker.
 *
 * Server Component. Editor+ sees the action buttons; viewer/viewer_basic
 * just sees the read-only tiles.
 */

import Link from 'next/link';
import { DashboardShell } from '../_components/dashboard-shell';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';
import { findMarketByKey } from '@/lib/repos/markets';
import { countComps } from '@/lib/repos/comps';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export default async function PricingLandingPage() {
  const { profile, user } = await requireAuthOrRedirect('/pricing');
  const canEdit = hasRole(profile, ['super_admin', 'editor']);

  const [market, compCount] = await Promise.all([
    findMarketByKey('east_end_li'),
    countComps(false),
  ]);

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  return (
    <DashboardShell activeHref="/pricing" user={dashboardUser}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <header>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              margin: 0,
              color: 'var(--color-text-primary)',
            }}
          >
            Pricing
          </h1>
          <p
            style={{
              margin: '4px 0 0 0',
              fontSize: 13,
              color: 'var(--color-text-secondary)',
            }}
          >
            Exit Pricing Framework — comp library + per-project pricing runs.
          </p>
        </header>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <Tile label="Comps in library" value={compCount.toLocaleString()} hint="closed + active, excluding archived" />
          <Tile
            label="Market"
            value={market?.name ?? '—'}
            hint={
              market
                ? `${market.subCuts.length} sub-cuts · ${market.defaultCompWindowMonths}-mo window`
                : 'East End config not seeded'
            }
          />
          <Tile
            label="Classification thresholds"
            value={market ? `rider ≤ ${market.riderThresholdPct}% · stretch ≤ ${market.stretchThresholdPct}%` : '—'}
            hint="vs strongest in-sub-cut anchor"
          />
        </section>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 12,
          }}
        >
          <ActionCard
            title="Comp library"
            description="Browse, add, and edit closed and active sales used as anchors and ceilings."
            primaryHref="/pricing/comps"
            primaryLabel="Open library"
            secondaryHref={canEdit ? '/pricing/comps/import' : undefined}
            secondaryLabel="Bulk import CSV"
          />
          <ActionCard
            title="Per-project runs"
            description="Pricing runs live inside each project's detail page under the Pricing tab."
            primaryHref="/projects"
            primaryLabel="Pick a project"
          />
        </section>

        {market && market.subCuts.length > 0 && (
          <section
            style={{
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border-hairline)',
              borderRadius: 14,
              padding: 20,
            }}
          >
            <h2
              style={{
                margin: '0 0 12px 0',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--color-text-primary)',
              }}
            >
              Sub-cut taxonomy — {market.name}
            </h2>
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 8,
              }}
            >
              {market.subCuts.map((sc) => (
                <li
                  key={sc.key}
                  style={{
                    fontSize: 12,
                    padding: '8px 10px',
                    background: 'var(--color-surface-base)',
                    border: '1px solid var(--color-border-hairline)',
                    borderRadius: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>
                    {sc.label}
                  </span>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>{sc.key}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </DashboardShell>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
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
          color: 'var(--color-text-primary)',
          marginTop: 6,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      {hint && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--color-text-tertiary)',
            marginTop: 4,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function ActionCard({
  title,
  description,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: {
  title: string;
  description: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <div
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div>
        <h3
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
          }}
        >
          {title}
        </h3>
        <p
          style={{
            margin: '4px 0 0 0',
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link
          href={primaryHref}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '8px 14px',
            fontSize: 13,
            fontWeight: 500,
            color: '#fff',
            background: 'var(--color-accent-base, #131313)',
            borderRadius: 8,
            textDecoration: 'none',
          }}
        >
          {primaryLabel}
        </Link>
        {secondaryHref && (
          <Link
            href={secondaryHref}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--color-text-primary)',
              background: 'var(--color-surface-base)',
              border: '1px solid var(--color-border-hairline)',
              borderRadius: 8,
              textDecoration: 'none',
            }}
          >
            {secondaryLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
