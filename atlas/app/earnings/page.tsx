/**
 * /earnings — Shareholder Earnings view (placeholder).
 *
 * T097 ships the full view (per-owner KPIs, by-project breakdown, 36mo timeline,
 * distribution log). That work is BLOCKED-ON-VIKTOR on the owner↔auth linkage
 * (atlas.owners has no user_id — email-only). This page exists so the V5.2
 * 6-item sidebar (T098) is honest: clicking "Earnings" lands somewhere, not 404.
 */

import { DashboardShell } from '../_components/dashboard-shell';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function EarningsPage() {
  const { profile, user } = await requireAuthOrRedirect('/earnings');
  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  return (
    <DashboardShell activeHref="/earnings" user={dashboardUser}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <header>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: '-0.025em',
              color: 'var(--color-text-primary)',
            }}
          >
            Earnings
          </h1>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 13,
              color: 'var(--color-text-secondary)',
            }}
          >
            Your share of forecast and realised profit, by project.
          </p>
        </header>

        <section
          style={{
            background: 'var(--ja-card-bg)',
            border: 'var(--ja-card-border)',
            borderRadius: 'var(--ja-card-radius)',
            padding: 32,
            textAlign: 'center',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--color-text-primary)',
            }}
          >
            Coming soon
          </h2>
          <p
            style={{
              margin: '10px auto 0',
              maxWidth: 520,
              fontSize: 13,
              lineHeight: 1.55,
              color: 'var(--color-text-secondary)',
            }}
          >
            The shareholder Earnings view ships once each owner&apos;s login is linked to their
            cap-table row. In the meantime your share of each project&apos;s forecast NPAT is
            visible on the project Summary tab (admins only) and your realised positions live with
            the bookkeeping.
          </p>
        </section>
      </div>
    </DashboardShell>
  );
}
