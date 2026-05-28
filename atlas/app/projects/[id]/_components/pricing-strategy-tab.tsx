'use client';

/**
 * D-025a — Pricing Strategy Tab.
 *
 * Replaces the bottoms-up L/B/H pricing-tab.tsx with a single-screen
 * Strategy Brief reader. The brief is generated server-side (Anthropic
 * web_search + structured prompt) and rendered here as a long-form
 * presentation, not as a form.
 *
 * UI states:
 *   - empty           : no brief yet → big "Generate strategy brief" CTA
 *   - generating      : POST /api/projects/[key]/pricing-brief in flight (~15-25s)
 *   - draft/applied   : full brief rendered top-to-bottom
 *   - error           : brief was generated with an error; show partial + retry
 *
 * Action bar at top: [Refresh] [Apply this version] [Version history dropdown]
 */

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { PricingBriefView } from '@/lib/repos/pricing-briefs';
import type {
  StrategyBrief,
  QuickMathRow,
  ReductionPhase,
  OutcomeScenario,
  RiskItem,
  MarketIndicator,
} from '@/lib/pricing/strategy-brief';
import type { ResearchedComp } from '@/lib/pricing/comp-researcher';

// ────────────────────────────────────────────────────────────────────────────
// Formatters
// ────────────────────────────────────────────────────────────────────────────

function usd(n: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (n == null) return '—';
  if (opts.compact && Math.abs(n) >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}
function pct(n: number | null | undefined, digits = 1): string {
  if (n == null) return '—';
  const v = n * 100;
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(digits)}%`;
}
function psfFmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return `$${Math.round(n).toLocaleString()}/SF`;
}
function date(s: string | null | undefined): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export function PricingStrategyTab({
  projectKey,
  currentBrief,
  briefHistory,
  isEditor,
}: {
  projectKey: string;
  currentBrief: PricingBriefView | null;
  briefHistory: PricingBriefView[];
  isEditor: boolean;
}) {
  const router = useRouter();
  const [generating, startGenerating] = useTransition();
  const [applying, startApplying] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const handleGenerate = useCallback(() => {
    setError(null);
    startGenerating(async () => {
      try {
        const res = await fetch(`/api/projects/${projectKey}/pricing-brief`, {
          method: 'POST',
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as
            | { error?: { message: string } }
            | null;
          setError(json?.error?.message ?? `Generation failed (HTTP ${res.status})`);
          return;
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Network error during generation');
      }
    });
  }, [projectKey, router]);

  const handleApply = useCallback(
    (briefId: string) => {
      setError(null);
      startApplying(async () => {
        try {
          const res = await fetch(
            `/api/projects/${projectKey}/pricing-brief/${briefId}/apply`,
            { method: 'POST' }
          );
          if (!res.ok) {
            const json = (await res.json().catch(() => null)) as
              | { error?: { message: string } }
              | null;
            setError(json?.error?.message ?? `Apply failed (HTTP ${res.status})`);
            return;
          }
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Network error during apply');
        }
      });
    },
    [projectKey, router]
  );

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!currentBrief) {
    return (
      <EmptyState
        isEditor={isEditor}
        generating={generating}
        onGenerate={handleGenerate}
        error={error}
      />
    );
  }

  // ── Loaded state ─────────────────────────────────────────────────────────
  const isApplied = currentBrief.status === 'applied';
  const hasError = !!currentBrief.generationError;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Action Bar */}
      <ActionBar
        brief={currentBrief}
        briefHistory={briefHistory}
        isEditor={isEditor}
        generating={generating}
        applying={applying}
        showHistory={showHistory}
        onToggleHistory={() => setShowHistory((s) => !s)}
        onGenerate={handleGenerate}
        onApply={handleApply}
      />

      {showHistory && briefHistory.length > 1 && (
        <BriefHistory briefs={briefHistory} currentId={currentBrief.id} />
      )}

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {hasError && (
        <div
          style={{
            fontSize: 13,
            padding: '10px 14px',
            background: 'var(--color-warning-soft, #fefce8)',
            border: '1px solid #fde047',
            borderRadius: 8,
            color: 'var(--color-warning, #a16207)',
          }}
        >
          ⚠ Generation partially failed: {currentBrief.generationError}. The brief below
          uses fallback values. Refresh to try again.
        </div>
      )}

      {/* The brief */}
      <BriefRenderer brief={currentBrief.brief} meta={currentBrief} isApplied={isApplied} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Empty state
// ────────────────────────────────────────────────────────────────────────────

function EmptyState({
  isEditor,
  generating,
  onGenerate,
  error,
}: {
  isEditor: boolean;
  generating: boolean;
  onGenerate: () => void;
  error: string | null;
}) {
  return (
    <div
      style={{
        background: 'var(--color-surface-raised, #fff)',
        border: '1px solid var(--color-border-hairline, #c8c8c5)',
        borderRadius: 14,
        padding: 32,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        alignItems: 'center',
      }}
    >
      <div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          No pricing strategy brief yet
        </h3>
        <p
          style={{
            margin: '6px 0 0',
            fontSize: 13,
            color: 'var(--color-text-secondary, #6b7280)',
            maxWidth: 520,
          }}
        >
          The brief researches comps from Zillow / Realtor.com / Out East / Compass,
          computes breakeven thresholds, builds a probability-weighted scenario set
          and reduction ladder, and recommends a launch price. ~20 seconds to generate.
        </p>
      </div>
      {isEditor && (
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          style={{
            fontSize: 14,
            fontWeight: 600,
            padding: '12px 24px',
            borderRadius: 10,
            border: 'none',
            background: 'var(--color-accent-base, #131313)',
            color: '#fff',
            cursor: generating ? 'wait' : 'pointer',
            opacity: generating ? 0.6 : 1,
          }}
        >
          {generating ? 'Generating strategy brief… (~20s)' : 'Generate strategy brief'}
        </button>
      )}
      {!isEditor && (
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary, #767b84)' }}>
          An editor needs to generate the first brief for this project.
        </p>
      )}
      {error && (
        <p style={{ fontSize: 13, color: 'var(--color-negative, #b91c1c)', margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Action bar
// ────────────────────────────────────────────────────────────────────────────

function ActionBar({
  brief,
  briefHistory,
  isEditor,
  generating,
  applying,
  showHistory,
  onToggleHistory,
  onGenerate,
  onApply,
}: {
  brief: PricingBriefView;
  briefHistory: PricingBriefView[];
  isEditor: boolean;
  generating: boolean;
  applying: boolean;
  showHistory: boolean;
  onToggleHistory: () => void;
  onGenerate: () => void;
  onApply: (id: string) => void;
}) {
  const isApplied = brief.status === 'applied';

  return (
    <div
      style={{
        background: 'var(--color-surface-raised, #fff)',
        border: '1px solid var(--color-border-hairline, #c8c8c5)',
        borderRadius: 14,
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ fontSize: 14 }}>
            Pricing Strategy v{brief.version}
          </strong>
          <StatusBadge status={brief.status} />
          {brief.usedWebSearch ? (
            <Badge color="positive">Live MLS data</Badge>
          ) : (
            <Badge color="warning">AI-estimated</Badge>
          )}
          {brief.dataGap && <Badge color="negative">Data gap</Badge>}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--color-text-tertiary, #767b84)',
            marginTop: 4,
          }}
        >
          Generated {date(brief.createdAt)} · Phase: {brief.phase} · {brief.compCount} comps
          {briefHistory.length > 1 && (
            <>
              {' · '}
              <button
                type="button"
                onClick={onToggleHistory}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: 'var(--color-text-secondary, #6b7280)',
                  cursor: 'pointer',
                  fontSize: 12,
                  textDecoration: 'underline',
                }}
              >
                {showHistory ? 'Hide' : 'Show'} history ({briefHistory.length})
              </button>
            </>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {isEditor && !isApplied && brief.recommendedPsfUsd && (
          <button
            type="button"
            onClick={() => onApply(brief.id)}
            disabled={applying}
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--color-accent-base, #131313)',
              color: '#fff',
              cursor: applying ? 'wait' : 'pointer',
              opacity: applying ? 0.6 : 1,
            }}
          >
            {applying ? 'Applying…' : 'Apply to project'}
          </button>
        )}
        {isEditor && (
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating}
            style={{
              fontSize: 13,
              fontWeight: 500,
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--color-border-hairline, #c8c8c5)',
              background: 'var(--color-surface-base, #fff)',
              color: 'var(--color-text-primary, #111)',
              cursor: generating ? 'wait' : 'pointer',
              opacity: generating ? 0.6 : 1,
            }}
          >
            {generating ? 'Refreshing… (~20s)' : 'Refresh brief'}
          </button>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Brief renderer — the actual content
// ────────────────────────────────────────────────────────────────────────────

function BriefRenderer({
  brief,
  meta,
  isApplied,
}: {
  brief: StrategyBrief;
  meta: PricingBriefView;
  isApplied: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Recommendation rec={brief.recommendation} isApplied={isApplied} thesis={brief.recommendation.oneLineThesis} />
      <BreakevenThresholds thresholds={brief.breakevenThresholds} />
      {brief.quickMath.length > 0 && <QuickMath rows={brief.quickMath} />}
      <CompEvidence evidence={brief.compEvidence} />
      <MarketSentiment sentiment={brief.marketSentiment} />
      <ReductionLadder ladder={brief.reductionLadder} />
      <OutcomeScenarios scenarios={brief.outcomeScenarios} />
      <RisksSection risks={brief.risks} />
      <WhyThisNumber section={brief.whyThisNumber} />
      <FinalRecommendation section={brief.finalRecommendation} />
      <Footer meta={meta} />
    </div>
  );
}

// ── Recommendation card ─────────────────────────────────────────────────────

function Recommendation({
  rec,
  isApplied,
  thesis,
}: {
  rec: StrategyBrief['recommendation'];
  isApplied: boolean;
  thesis: string;
}) {
  return (
    <Card accent>
      <SectionEyebrow label="Recommendation" />
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 16,
          flexWrap: 'wrap',
          marginTop: 8,
        }}
      >
        <div
          style={{
            fontSize: 30,
            fontWeight: 700,
            color: 'var(--color-text-primary, #111)',
            letterSpacing: '-0.025em',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {usd(rec.launchPriceUsd)}
        </div>
        <div
          style={{
            fontSize: 14,
            color: 'var(--color-text-secondary, #6b7280)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          launch · {psfFmt(rec.psfAtLaunch)}
        </div>
        {isApplied && <Badge color="positive">Applied to financial model</Badge>}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 14,
          marginTop: 18,
        }}
      >
        <Metric label="Margin at ask" value={pct(rec.expectedMarginPct)} marginColor={rec.expectedMarginPct} />
        <Metric
          label="Probability-weighted"
          value={pct(rec.probWeightedMarginPct)}
          marginColor={rec.probWeightedMarginPct}
        />
      </div>
      <p
        style={{
          margin: '14px 0 0',
          fontSize: 13,
          color: 'var(--color-text-secondary, #6b7280)',
          lineHeight: 1.5,
          fontStyle: 'italic',
        }}
      >
        “{thesis}”
      </p>
    </Card>
  );
}

// ── Breakeven thresholds ────────────────────────────────────────────────────

function BreakevenThresholds({
  thresholds,
}: {
  thresholds: StrategyBrief['breakevenThresholds'];
}) {
  return (
    <Card>
      <SectionHeader label="Breakeven & margin thresholds" />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
        }}
      >
        <Tile label="Total dev cost" value={usd(thresholds.totalDevCostUsd)} />
        <Tile
          label="Breakeven exit"
          value={usd(thresholds.breakevenExitUsd)}
          hint={psfFmt(thresholds.breakevenPsf)}
        />
        <Tile label="5% margin" value={usd(thresholds.margin5ExitUsd)} hint="bare minimum" />
        <Tile label="10% margin" value={usd(thresholds.margin10ExitUsd)} hint="Juno floor" />
        <Tile label="15% margin" value={usd(thresholds.margin15ExitUsd)} hint="stretch" />
      </div>
    </Card>
  );
}

// ── Quick Math table ────────────────────────────────────────────────────────

function QuickMath({ rows }: { rows: QuickMathRow[] }) {
  return (
    <Card>
      <SectionHeader label="Quick math — what if we sell at…" />
      <div style={{ overflowX: 'auto', marginTop: 4 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)' }}>
              {['Scenario', 'Exit', '$/SF', 'Net after closing', 'Profit', 'Margin', 'Read'].map((h, i) => (
                <th key={h} style={thStyle(i > 0 ? 'right' : 'left')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)' }}>
                <td style={tdStyle()}>{r.scenario}</td>
                <td style={tdStyle('right', true)}>{usd(r.exitUsd)}</td>
                <td style={tdStyle('right', true)}>{psfFmt(r.psf)}</td>
                <td style={tdStyle('right', true)}>{usd(r.netAfterClosingUsd)}</td>
                <td style={{ ...tdStyle('right', true), color: r.profitUsd < 0 ? 'var(--color-negative, #b91c1c)' : 'var(--color-text-primary, #111)' }}>
                  {usd(r.profitUsd)}
                </td>
                <td style={{ ...tdStyle('right', true), fontWeight: 600, color: marginColor(r.marginPct) }}>
                  {pct(r.marginPct)}
                </td>
                <td style={tdStyle()}>
                  <ReadBadge read={r.read} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Comp evidence ───────────────────────────────────────────────────────────

function CompEvidence({ evidence }: { evidence: StrategyBrief['compEvidence'] }) {
  return (
    <Card>
      <SectionHeader
        label="Comp evidence"
        badge={`${evidence.closedComps.length} closed · ${evidence.activeComps.length} active`}
      />
      {evidence.dataGap && (
        <div
          style={{
            fontSize: 12,
            padding: '6px 10px',
            background: 'var(--color-negative-soft, #fef2f2)',
            border: '1px solid #fca5a5',
            color: 'var(--color-negative, #b91c1c)',
            borderRadius: 6,
            marginBottom: 10,
            display: 'inline-block',
          }}
        >
          ⚠ Data gap: fewer than 3 closed comps in this sub-cut
        </div>
      )}
      {evidence.medianPsf && evidence.rangePsf && (
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary, #6b7280)', margin: '0 0 12px' }}>
          Median closed PSF:{' '}
          <strong style={{ color: 'var(--color-text-primary, #111)' }}>{psfFmt(evidence.medianPsf)}</strong>{' '}
          · Range: {psfFmt(evidence.rangePsf.low)} – {psfFmt(evidence.rangePsf.high)}
        </p>
      )}
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary, #6b7280)', margin: '0 0 12px', lineHeight: 1.6 }}>
        {evidence.narrativeSummary}
      </p>
      <CompTable label="Closed comps" comps={evidence.closedComps} />
      {evidence.activeComps.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <CompTable label="Active listings (ceiling)" comps={evidence.activeComps} />
        </div>
      )}
    </Card>
  );
}

function CompTable({ label, comps }: { label: string; comps: ResearchedComp[] }) {
  if (comps.length === 0) {
    return (
      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary, #767b84)', margin: 0 }}>
        {label}: none found.
      </p>
    );
  }
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-tertiary, #767b84)', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)' }}>
              {['Address', 'Sold / Listed', 'SF', 'Price', '$/SF', 'Source'].map((h, i) => (
                <th key={h} style={thStyle(i >= 2 && i <= 4 ? 'right' : 'left')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comps.map((c, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)' }}>
                <td style={tdStyle()}>
                  {c.sourceUrl ? (
                    <a
                      href={c.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--color-text-primary, #111)', textDecoration: 'none' }}
                    >
                      {c.address}
                    </a>
                  ) : (
                    c.address
                  )}
                </td>
                <td style={tdStyle()}>{c.closingDate ?? 'active'}</td>
                <td style={tdStyle('right', true)}>{c.agSqft.toLocaleString()}</td>
                <td style={tdStyle('right', true)}>{usd(c.salePriceUsd)}</td>
                <td style={{ ...tdStyle('right', true), fontWeight: 600 }}>{psfFmt(c.psf)}</td>
                <td style={tdStyle()}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary, #767b84)' }}>
                    {c.sourceName}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Market Sentiment ────────────────────────────────────────────────────────

function MarketSentiment({ sentiment }: { sentiment: StrategyBrief['marketSentiment'] }) {
  if (sentiment.indicators.length === 0 && !sentiment.overallRead) return null;
  return (
    <Card>
      <SectionHeader label="Market sentiment" />
      {sentiment.indicators.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)' }}>
                {['Indicator', 'Reading', 'Implication'].map((h) => (
                  <th key={h} style={thStyle('left')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sentiment.indicators.map((ind: MarketIndicator, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)' }}>
                  <td style={tdStyle()}>{ind.indicator}</td>
                  <td style={{ ...tdStyle(), fontWeight: 500 }}>{ind.reading}</td>
                  <td style={{ ...tdStyle(), color: 'var(--color-text-secondary, #6b7280)' }}>
                    {ind.implication}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sentiment.overallRead && (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: 'var(--color-text-secondary, #6b7280)',
            lineHeight: 1.6,
            fontStyle: 'italic',
          }}
        >
          {sentiment.overallRead}
        </p>
      )}
    </Card>
  );
}

// ── Reduction Ladder ────────────────────────────────────────────────────────

function ReductionLadder({ ladder }: { ladder: StrategyBrief['reductionLadder'] }) {
  if (ladder.phases.length === 0) return null;
  return (
    <Card>
      <SectionHeader label="Reduction ladder & DOM triggers" />
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary, #6b7280)', margin: '0 0 14px', lineHeight: 1.5 }}>
        Pre-commit these triggers. The discipline is: reduce ON the trigger, not before.
        Multiple early cuts signal weakness.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ladder.phases.map((p: ReductionPhase, i) => (
          <LadderRow key={i} phase={p} />
        ))}
        <div
          style={{
            marginTop: 8,
            padding: '12px 14px',
            background: 'var(--color-negative-soft, #fef2f2)',
            border: '1px solid #fca5a5',
            borderRadius: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-negative, #b91c1c)' }}>
                Walk-away floor
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                {usd(ladder.walkAwayFloor.priceUsd)} · {psfFmt(ladder.walkAwayFloor.psf)} · {pct(ladder.walkAwayFloor.marginPct)}
              </div>
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--color-text-secondary, #6b7280)',
                maxWidth: 420,
                lineHeight: 1.5,
              }}
            >
              {ladder.walkAwayFloor.action}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function LadderRow({ phase }: { phase: ReductionPhase }) {
  return (
    <div
      style={{
        padding: '12px 14px',
        background: 'var(--color-surface-base, #fff)',
        border: '1px solid var(--color-border-hairline, #c8c8c5)',
        borderRadius: 8,
        display: 'grid',
        gridTemplateColumns: 'minmax(70px, 1fr) minmax(120px, 1fr) minmax(80px, 1fr) minmax(70px, 1fr) minmax(200px, 2fr)',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-tertiary, #767b84)' }}>
        {phase.label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {usd(phase.priceUsd)}
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #6b7280)', fontVariantNumeric: 'tabular-nums' }}>
        {psfFmt(phase.psf)}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: marginColor(phase.marginPct), fontVariantNumeric: 'tabular-nums' }}>
        {pct(phase.marginPct)}
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #6b7280)', lineHeight: 1.4 }}>
        <strong style={{ color: 'var(--color-text-primary, #111)', fontWeight: 500 }}>
          {phase.trigger}
        </strong>
        {' — '}
        {phase.action}
      </div>
    </div>
  );
}

// ── Outcome Scenarios ───────────────────────────────────────────────────────

function OutcomeScenarios({ scenarios }: { scenarios: StrategyBrief['outcomeScenarios'] }) {
  if (scenarios.scenarios.length === 0) return null;
  return (
    <Card>
      <SectionHeader
        label="Outcome scenarios"
        badge={`P-weighted: ${pct(scenarios.probWeightedExpectedMarginPct)}`}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {scenarios.scenarios.map((s: OutcomeScenario, i) => (
          <ScenarioRow key={i} scenario={s} />
        ))}
      </div>
      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary, #767b84)', margin: '12px 0 0', lineHeight: 1.5 }}>
        Probability-weighted expected exit: <strong style={{ color: 'var(--color-text-primary, #111)', fontVariantNumeric: 'tabular-nums' }}>{usd(scenarios.probWeightedExpectedExitUsd)}</strong>
      </p>
    </Card>
  );
}

function ScenarioRow({ scenario }: { scenario: OutcomeScenario }) {
  return (
    <div
      style={{
        padding: '10px 14px',
        background: 'var(--color-surface-base, #fff)',
        border: '1px solid var(--color-border-hairline, #c8c8c5)',
        borderRadius: 8,
        display: 'grid',
        gridTemplateColumns: 'minmax(80px, 1fr) minmax(220px, 3fr) minmax(100px, 1fr) minmax(70px, 1fr) minmax(50px, 0.5fr)',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600 }}>{scenario.name}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #6b7280)', lineHeight: 1.4 }}>
        {scenario.description}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {usd(scenario.exitUsd)}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: marginColor(scenario.marginPct), fontVariantNumeric: 'tabular-nums' }}>
        {pct(scenario.marginPct)}
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary, #767b84)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
        {scenario.probabilityPct}%
      </div>
    </div>
  );
}

// ── Risks ───────────────────────────────────────────────────────────────────

function RisksSection({ risks }: { risks: RiskItem[] }) {
  if (risks.length === 0) return null;
  return (
    <Card>
      <SectionHeader label="Risks & mitigations" />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)' }}>
              {['Risk', 'Impact', 'Mitigation'].map((h) => (
                <th key={h} style={{ ...thStyle('left'), width: h === 'Risk' ? '25%' : undefined }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {risks.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)' }}>
                <td style={{ ...tdStyle(), fontWeight: 600, verticalAlign: 'top' }}>{r.risk}</td>
                <td style={{ ...tdStyle(), color: 'var(--color-text-secondary, #6b7280)', verticalAlign: 'top' }}>
                  {r.impact}
                </td>
                <td style={{ ...tdStyle(), color: 'var(--color-text-primary, #111)', verticalAlign: 'top' }}>
                  {r.mitigation}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Why this number ─────────────────────────────────────────────────────────

function WhyThisNumber({ section }: { section: StrategyBrief['whyThisNumber'] }) {
  if (!section.headline && section.whyNotHigher.length === 0 && section.whyNotLower.length === 0) {
    return null;
  }
  return (
    <Card>
      <SectionHeader label="Why this number" />
      {section.headline && (
        <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.5 }}>
          {section.headline}
        </p>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        <WhyColumn label="Why not higher" bullets={section.whyNotHigher} />
        <WhyColumn label="Why not lower" bullets={section.whyNotLower} />
      </div>
    </Card>
  );
}

function WhyColumn({ label, bullets }: { label: string; bullets: string[] }) {
  if (bullets.length === 0) return null;
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-tertiary, #767b84)',
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <ul style={{ margin: 0, padding: '0 0 0 16px', listStyle: 'disc', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {bullets.map((b, i) => (
          <li
            key={i}
            style={{
              fontSize: 12,
              color: 'var(--color-text-secondary, #6b7280)',
              lineHeight: 1.5,
            }}
          >
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Final recommendation ────────────────────────────────────────────────────

function FinalRecommendation({ section }: { section: StrategyBrief['finalRecommendation'] }) {
  if (!section.icFraming && section.nextSteps.length === 0) return null;
  return (
    <Card>
      <SectionHeader label="IC framing & next steps" />
      {section.icFraming && (
        <p
          style={{
            margin: '0 0 14px',
            fontSize: 13,
            color: 'var(--color-text-secondary, #6b7280)',
            lineHeight: 1.6,
          }}
        >
          {section.icFraming}
        </p>
      )}
      {section.nextSteps.length > 0 && (
        <ol style={{ margin: 0, padding: '0 0 0 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {section.nextSteps.map((s, i) => (
            <li key={i} style={{ fontSize: 13, lineHeight: 1.5 }}>
              {s}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// ── History list ────────────────────────────────────────────────────────────

function BriefHistory({ briefs, currentId }: { briefs: PricingBriefView[]; currentId: string }) {
  return (
    <Card>
      <SectionHeader label="Version history" />
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)' }}>
            {['Version', 'Status', 'Phase', 'Recommended', 'Comps', 'Generated'].map((h) => (
              <th key={h} style={thStyle('left')}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {briefs.map((b) => (
            <tr key={b.id} style={{ borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)' }}>
              <td style={{ ...tdStyle(), fontWeight: 600 }}>
                v{b.version}{b.id === currentId ? ' (current)' : ''}
              </td>
              <td style={tdStyle()}><StatusBadge status={b.status} /></td>
              <td style={tdStyle()}>{b.phase}</td>
              <td style={{ ...tdStyle(), fontVariantNumeric: 'tabular-nums' }}>
                {usd(b.recommendedLaunchPriceUsd)} · {pct(b.expectedMarginPct)}
              </td>
              <td style={tdStyle()}>{b.compCount}</td>
              <td style={{ ...tdStyle(), color: 'var(--color-text-tertiary, #767b84)' }}>
                {date(b.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ── Footer ──────────────────────────────────────────────────────────────────

function Footer({ meta }: { meta: PricingBriefView }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: 'var(--color-text-tertiary, #767b84)',
        textAlign: 'center',
        padding: '12px 0 8px',
      }}
    >
      Generated by Juno Atlas Strategy Brief Engine · {date(meta.createdAt)}
      {meta.appliedAt && ` · Applied ${date(meta.appliedAt)}`}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Reusable primitives
// ────────────────────────────────────────────────────────────────────────────

function Card({
  children,
  accent,
}: {
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: 'var(--color-surface-raised, #fff)',
        border: accent
          ? '2px solid var(--color-accent-base, #131313)'
          : '1px solid var(--color-border-hairline, #c8c8c5)',
        borderRadius: 14,
        padding: 20,
      }}
    >
      {children}
    </div>
  );
}

function SectionHeader({ label, badge }: { label: string; badge?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary, #111)' }}>
        {label}
      </h2>
      {badge && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 7px',
            borderRadius: 999,
            background: 'var(--color-surface-base, #fff)',
            border: '1px solid var(--color-border-hairline, #c8c8c5)',
            color: 'var(--color-text-tertiary, #767b84)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

function SectionEyebrow({ label }: { label: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--color-text-tertiary, #767b84)',
      }}
    >
      {label}
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      style={{
        background: 'var(--color-surface-base, #fff)',
        border: '1px solid var(--color-border-hairline, #c8c8c5)',
        borderRadius: 8,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-tertiary, #767b84)' }}>
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary, #767b84)', marginTop: 2 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  marginColor: m,
}: {
  label: string;
  value: string;
  marginColor?: number | null;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-tertiary, #767b84)',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          color: m == null ? 'var(--color-text-primary, #111)' : marginColor(m),
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, 'positive' | 'warning' | 'neutral' | 'negative'> = {
    applied: 'positive',
    draft: 'warning',
    superseded: 'neutral',
    failed: 'negative',
  };
  return <Badge color={map[status] ?? 'neutral'}>{status}</Badge>;
}

function ReadBadge({ read }: { read: string }) {
  const r = read.toLowerCase();
  let color: 'positive' | 'warning' | 'negative' | 'neutral' = 'neutral';
  if (r === 'strong' || r === 'acceptable') color = 'positive';
  else if (r === 'marginal') color = 'warning';
  else if (r === 'loss') color = 'negative';
  return <Badge color={color}>{read}</Badge>;
}

function Badge({
  color,
  children,
}: {
  color: 'positive' | 'warning' | 'negative' | 'neutral';
  children: React.ReactNode;
}) {
  const palette = {
    positive: { bg: '#ecfdf5', border: '#6ee7b7', text: '#065f46' },
    warning: { bg: '#fefce8', border: '#fde047', text: '#713f12' },
    negative: { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
    neutral: { bg: 'var(--color-surface-base, #fff)', border: 'var(--color-border-hairline, #c8c8c5)', text: 'var(--color-text-tertiary, #767b84)' },
  };
  const p = palette[color];
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: '2px 7px',
        borderRadius: 999,
        background: p.bg,
        border: `1px solid ${p.border}`,
        color: p.text,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {children}
    </span>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      style={{
        fontSize: 13,
        padding: '10px 14px',
        background: 'var(--color-negative-soft, #fef2f2)',
        border: '1px solid #fca5a5',
        borderRadius: 8,
        color: 'var(--color-negative, #b91c1c)',
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--color-negative, #b91c1c)',
          cursor: 'pointer',
          fontSize: 14,
          padding: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Style helpers
// ────────────────────────────────────────────────────────────────────────────

function thStyle(align: 'left' | 'right' = 'left'): React.CSSProperties {
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

function tdStyle(align: 'left' | 'right' = 'left', tabular = false): React.CSSProperties {
  return {
    padding: '8px 10px',
    textAlign: align,
    color: 'var(--color-text-primary, #111)',
    fontVariantNumeric: tabular ? 'tabular-nums' : undefined,
  };
}

function marginColor(m: number | null | undefined): string {
  if (m == null) return 'var(--color-text-tertiary, #767b84)';
  if (m >= 0.10) return 'var(--color-positive, #15803d)';
  if (m >= 0) return 'var(--color-warning, #a16207)';
  return 'var(--color-negative, #b91c1c)';
}
