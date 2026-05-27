/**
 * V4.3 — /risks (INVENTORY §21 Risks Center).
 *
 * Portfolio-wide risk surface. 6-KPI strip with severity breakdown, six
 * category cards, per-finding rows with severity chip + scope + impact
 * + trigger + mitigation. Runs `buildPortfolioRiskReport()` over the
 * aggregated portfolio + per-project results.
 *
 * Restores the third of four dead sidebar links (the fourth, /suggestions,
 * lands in V4.8).
 */

import { DashboardShell } from '../_components/dashboard-shell';
import { findManyProjects } from '@/lib/repos/project';
import { aggregatePortfolio } from '@/lib/calc/portfolio/aggregate';
import { runProject } from '@/lib/calc/project/runProject';
import { BASELINE_GLOBALS } from '@/lib/calc/baselines';
import { getActiveScenario } from '@/lib/scenarios/active';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { buildPortfolioRiskReport, type RiskFinding, type RiskSeverity } from '@/lib/risk/portfolio-risk';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export default async function RisksCenterPage() {
  const { profile, user } = await requireAuthOrRedirect('/risks');
  const { projects } = await findManyProjects({ limit: 100 });
  const active = await getActiveScenario(); // V4.12
  const portfolio = aggregatePortfolio(projects, BASELINE_GLOBALS, active.scenario);
  const perProject = projects.map((p) => ({
    project: p,
    result: runProject(p, BASELINE_GLOBALS, active.scenario),
  }));
  const report = buildPortfolioRiskReport({ projects: perProject, portfolio });

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  const { totals, categories, findings } = report;

  // KPI strip per INVENTORY §21.
  const kpis: Array<{ label: string; value: string; hint?: string; tone?: 'negative' | 'neutral' }> = [
    { label: 'Total findings', value: String(totals.total), hint: totals.total === 0 ? 'all clear' : 'across the portfolio' },
    {
      label: 'High severity',
      value: String(totals.high),
      hint: 'review immediately',
      tone: totals.high > 0 ? 'negative' : 'neutral',
    },
    { label: 'Medium severity', value: String(totals.medium), hint: 'monitor + plan' },
    { label: 'Low severity', value: String(totals.low), hint: 'watchlist' },
    { label: 'Active categories', value: `${totals.activeCategories}/6`, hint: '6 categories total' },
    { label: 'Capital findings', value: String(totals.capitalFindings), hint: 'equity cluster + funding gap' },
  ];

  // Severity-grouped buckets so the cards land in the right order
  // (high → medium → low). Within each, sort by financialImpactUsd magnitude.
  const sorted = [...findings].sort((a, b) => {
    const sevWeight: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 };
    if (sevWeight[a.severity] !== sevWeight[b.severity]) {
      return sevWeight[a.severity] - sevWeight[b.severity];
    }
    return Math.abs(b.financialImpactUsd) - Math.abs(a.financialImpactUsd);
  });

  return (
    <DashboardShell
      activeHref="/risks"
      user={dashboardUser}
      activeScenarioId={active.activeId}
      activeScenarioName={active.displayName}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <header>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0, color: 'var(--color-text-primary)' }}>
            Risks
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Portfolio-wide risk findings — six categories, severity-ranked, with mitigation playbooks.
          </p>
        </header>

        {/* KPI strip */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
          }}
        >
          {kpis.map((k) => (
            <KpiTile key={k.label} {...k} />
          ))}
        </section>

        {/* Category overview */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 12,
          }}
        >
          {categories.map((c) => (
            <CategoryCard key={c.id} {...c} />
          ))}
        </section>

        {/* Findings list */}
        <section
          style={{
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border-hairline)',
            borderRadius: 14,
            padding: 20,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Active findings ({findings.length})
          </h2>
          {findings.length === 0 ? (
            <p style={{ margin: '12px 0 0 0', fontSize: 13, color: 'var(--color-text-tertiary)' }}>
              No active findings — the portfolio is within thresholds today. As projects move through
              their lifecycle, this list will populate.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sorted.map((f) => (
                <li key={f.id}>
                  <FindingCard finding={f} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}

function KpiTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'negative' | 'neutral';
}) {
  return (
    <div
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderLeft:
          tone === 'negative'
            ? '3px solid var(--color-negative, #dc2626)'
            : '1px solid var(--color-border-hairline)',
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
          color: tone === 'negative' ? 'var(--color-negative, #dc2626)' : 'var(--color-text-primary)',
          marginTop: 6,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      {hint && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function CategoryCard({
  label,
  description,
  count,
}: {
  id: string;
  label: string;
  description: string;
  count: number;
}) {
  const hasFindings = count > 0;
  return (
    <div
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderLeft: hasFindings
          ? '3px solid var(--color-negative, #dc2626)'
          : '3px solid var(--color-positive, #15803d)',
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{label}</strong>
        <span
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: hasFindings ? 'var(--color-negative, #dc2626)' : 'var(--color-text-tertiary)',
            fontVariantNumeric: 'tabular-nums',
          }}
          title={`${count} ${hasFindings ? 'finding' + (count === 1 ? '' : 's') : 'clear'}`}
        >
          {count}
        </span>
      </div>
      <p style={{ margin: '6px 0 0 0', fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
        {description}
      </p>
    </div>
  );
}

function FindingCard({ finding: f }: { finding: RiskFinding }) {
  const sevColor: Record<RiskSeverity, string> = {
    high: 'var(--color-negative, #b91c1c)',
    medium: 'var(--color-warning, #a16207)',
    low: 'var(--color-text-tertiary)',
  };
  const sevBg: Record<RiskSeverity, string> = {
    high: 'var(--color-negative-soft, #fef2f2)',
    medium: 'var(--color-warning-soft, #fefce8)',
    low: 'var(--color-surface-base)',
  };
  return (
    <article
      style={{
        background: 'var(--color-surface-base)',
        border: '1px solid var(--color-border-hairline)',
        borderLeft: `3px solid ${sevColor[f.severity]}`,
        borderRadius: 10,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Header row */}
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: sevColor[f.severity],
              background: sevBg[f.severity],
              padding: '2px 8px',
              borderRadius: 4,
            }}
          >
            {f.severity}
          </span>
          <strong style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{f.categoryLabel}</strong>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>·</span>
          {f.scopeKind === 'project' && f.scopeId ? (
            <a
              href={`/projects/${f.scopeId}`}
              style={{
                fontSize: 12,
                color: 'var(--color-text-secondary)',
                textDecoration: 'underline',
                textUnderlineOffset: 2,
              }}
            >
              {f.scopeLabel}
            </a>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{f.scopeLabel}</span>
          )}
        </div>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: f.financialImpactUsd < 0 ? 'var(--color-negative, #b91c1c)' : 'var(--color-positive, #15803d)',
            fontVariantNumeric: 'tabular-nums',
          }}
          title="Estimated financial impact"
        >
          {fmtImpact(f.financialImpactUsd)}
        </span>
      </header>

      <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.45 }}>
        <strong style={{ color: 'var(--color-text-secondary)' }}>Trigger:</strong> {f.trigger}
      </p>
      {f.timingImpact && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>
          <strong style={{ color: 'var(--color-text-tertiary)' }}>Timing:</strong> {f.timingImpact}
        </p>
      )}
      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>
        <strong style={{ color: 'var(--color-text-tertiary)' }}>Mitigation:</strong> {f.mitigation}
      </p>
    </article>
  );
}

function fmtImpact(n: number): string {
  if (n === 0) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '+';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}
