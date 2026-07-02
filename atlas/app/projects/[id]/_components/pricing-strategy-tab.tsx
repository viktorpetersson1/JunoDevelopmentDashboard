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
import { CompProvenanceBadge } from '@/app/pricing/_components/comp-provenance-badge';
import type { ResearchedComp } from '@/lib/pricing/comp-researcher';
import type { PerplexityCitation } from '@/lib/llm/perplexity-client';
import type { TriangulationBlock, BuyerMigrationThesis } from '@/lib/pricing/schemas';

/** D-026(c): map an AI-research comp to a provenance bucket for the badge. */
function researchedCompProvenance(c: ResearchedComp): 'ai_live' | 'ai_estimated' {
  return c.confidence === 'confirmed' ? 'ai_live' : 'ai_estimated';
}

/** V6.1.5 — rider/maker classification labels (framework §3.3). */
const CLASSIFICATION_LABEL: Record<string, string> = {
  rider: 'Rider',
  stretch_rider: 'Stretch Rider',
  market_maker: 'Market-Maker',
  market_rider: 'Market-Rider',
};

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
  premium,
  isEditor,
  hasAddress,
}: {
  projectKey: string;
  currentBrief: PricingBriefView | null;
  briefHistory: PricingBriefView[];
  /** V6.1.5-019 — documented premium vs the closed anchor (null = price-taker). */
  premium?: { premiumPct: number | null; premiumBasis: string | null };
  isEditor: boolean;
  /**
   * T090 — true when the project has a real street address. When false the
   * pricing AI features (brief generation, comp research, location auto-
   * detect) are non-functional, so the tab short-circuits to an "address
   * required" empty state instead of letting users click Generate and hit
   * a 400.
   */
  hasAddress: boolean;
}) {
  const router = useRouter();
  const [generating, startGenerating] = useTransition();
  const [updating, startUpdating] = useTransition();
  const [applying, startApplying] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [compNote, setCompNote] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const handleGenerate = useCallback(() => {
    setError(null);
    startGenerating(async () => {
      try {
        const res = await fetch(`/api/projects/${projectKey}/pricing-brief`, {
          method: 'POST',
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as {
            error?: { message: string };
          } | null;
          setError(json?.error?.message ?? `Generation failed (HTTP ${res.status})`);
          return;
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Network error during generation');
      }
    });
  }, [projectKey, router]);

  // V6.1.5-018 — "Update comps from market": the ONLY action that pulls fresh
  // web comps. A plain Refresh re-derives deterministically from stored comps;
  // this re-researches and surfaces what changed (the price only moves if comps did).
  const handleUpdateComps = useCallback(() => {
    setError(null);
    setCompNote(null);
    startUpdating(async () => {
      try {
        const res = await fetch(`/api/projects/${projectKey}/pricing-brief`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ forceResearch: true }),
        });
        const json = (await res.json().catch(() => null)) as {
          error?: { message: string };
          compChange?: { summary?: string } | null;
        } | null;
        if (!res.ok) {
          setError(json?.error?.message ?? `Update failed (HTTP ${res.status})`);
          return;
        }
        if (json?.compChange?.summary) setCompNote(json.compChange.summary);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Network error during comp update');
      }
    });
  }, [projectKey, router]);

  const handleApply = useCallback(
    (briefId: string) => {
      setError(null);
      startApplying(async () => {
        try {
          const res = await fetch(`/api/projects/${projectKey}/pricing-brief/${briefId}/apply`, {
            method: 'POST',
          });
          if (!res.ok) {
            const json = (await res.json().catch(() => null)) as {
              error?: { message: string };
            } | null;
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

  // ── Address-missing state (T090) ─────────────────────────────────────────
  // The pricing AI features depend on a real street address — geocoding,
  // AI comp research, and the location classifier all fail (or return
  // garbage) without one. Short-circuit to a friendly explanation rather
  // than letting Generate fire and 400.
  if (!hasAddress) {
    return <AddressRequiredEmptyState projectKey={projectKey} isEditor={isEditor} />;
  }

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Action Bar */}
      <ActionBar
        brief={currentBrief}
        briefHistory={briefHistory}
        isEditor={isEditor}
        generating={generating}
        updating={updating}
        applying={applying}
        showHistory={showHistory}
        onToggleHistory={() => setShowHistory((s) => !s)}
        onGenerate={handleGenerate}
        onUpdateComps={handleUpdateComps}
        onApply={handleApply}
      />

      {showHistory && briefHistory.length > 1 && (
        <BriefHistory briefs={briefHistory} currentId={currentBrief.id} />
      )}

      {isEditor && (
        <PremiumControl
          projectKey={projectKey}
          premium={premium ?? { premiumPct: null, premiumBasis: null }}
          disabled={generating || updating}
          onSaved={handleGenerate}
          onError={setError}
        />
      )}

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {compNote && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 12,
            color: 'var(--color-text-tertiary, #767b84)',
            padding: '0 2px',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: 'var(--color-positive, #15803d)',
              flex: '0 0 auto',
            }}
          />
          {compNote}
        </div>
      )}

      {/* The brief. The per-brief generationError is surfaced INSIDE the brief
          (folded into the unavailable-recommendation card, or a quiet one-line
          note when a usable rec exists) — never as a second stacked banner. */}
      <BriefRenderer
        brief={currentBrief.brief}
        citations={currentBrief.citations}
        llmProvider={currentBrief.llmProvider}
        isApplied={isApplied}
        hasError={hasError}
        generationError={currentBrief.generationError}
        isEditor={isEditor}
        applying={applying}
        onApply={() => handleApply(currentBrief.id)}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// T090 — Address-required state
// ────────────────────────────────────────────────────────────────────────────

function AddressRequiredEmptyState({
  projectKey,
  isEditor,
}: {
  projectKey: string;
  isEditor: boolean;
}) {
  return (
    <div
      style={{
        background: 'var(--color-surface-raised, #fff)',
        border: '1px solid var(--color-border-hairline, #c8c8c5)',
        borderRadius: 'var(--ja-card-radius)',
        padding: 32,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        alignItems: 'center',
      }}
    >
      <div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Site address required</h3>
        <p
          style={{
            margin: '6px 0 0',
            fontSize: 13,
            color: 'var(--color-text-secondary, #6b7280)',
            maxWidth: 520,
          }}
        >
          The pricing recommendation depends on a real street address — comp research, location
          auto-detect, and the strategy brief all need somewhere to anchor the analysis. Add an
          address in the Inputs tab to activate this tab.
        </p>
      </div>
      {isEditor ? (
        <a
          href={`/projects/${projectKey}?tab=inputs`}
          style={{
            fontSize: 14,
            fontWeight: 700,
            padding: '12px 24px',
            borderRadius: 10,
            background: 'var(--color-accent-base, #131313)',
            color: '#fff',
            textDecoration: 'none',
          }}
        >
          Go to Inputs →
        </a>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary, #767b84)' }}>
          An editor needs to assign a site address to this project.
        </p>
      )}
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
        borderRadius: 'var(--ja-card-radius)',
        padding: 32,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        alignItems: 'center',
      }}
    >
      <div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>No pricing recommendation yet</h3>
        <p
          style={{
            margin: '6px 0 0',
            fontSize: 13,
            color: 'var(--color-text-secondary, #6b7280)',
            maxWidth: 520,
          }}
        >
          The recommendation researches comps from Zillow / Realtor.com / Out East / Compass,
          computes breakeven thresholds, builds a probability-weighted scenario set and reduction
          ladder, and recommends a launch price. ~20 seconds to generate.
        </p>
      </div>
      {isEditor && (
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          style={{
            fontSize: 14,
            fontWeight: 700,
            padding: '12px 24px',
            borderRadius: 10,
            border: 'none',
            background: 'var(--color-accent-base, #131313)',
            color: '#fff',
            cursor: generating ? 'wait' : 'pointer',
            opacity: generating ? 0.6 : 1,
          }}
        >
          {generating ? 'Generating recommendation… (~20s)' : 'Generate recommendation'}
        </button>
      )}
      {!isEditor && (
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary, #767b84)' }}>
          An editor needs to generate the first recommendation for this project.
        </p>
      )}
      {error && (
        <p style={{ fontSize: 13, color: 'var(--color-negative, #b91c1c)', margin: 0 }}>{error}</p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// V6.1.5-019 — documented premium control (editor-only, quiet inline row)
// ────────────────────────────────────────────────────────────────────────────

function PremiumControl({
  projectKey,
  premium,
  disabled,
  onSaved,
  onError,
}: {
  projectKey: string;
  premium: { premiumPct: number | null; premiumBasis: string | null };
  disabled: boolean;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pct, setPct] = useState<string>(
    premium.premiumPct != null ? String(premium.premiumPct) : ''
  );
  const [basis, setBasis] = useState<string>(premium.premiumBasis ?? '');
  const [saving, startSaving] = useTransition();

  const save = useCallback(
    (clear: boolean) => {
      startSaving(async () => {
        try {
          const body = clear
            ? { premiumPct: null, premiumBasis: null }
            : { premiumPct: Number(pct), premiumBasis: basis.trim() || null };
          if (!clear && (!Number.isFinite(body.premiumPct) || pct.trim() === '')) {
            onError('Premium must be a number (percent vs the closed anchor).');
            return;
          }
          const res = await fetch(`/api/projects/${projectKey}/pricing-premium`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const json = (await res.json().catch(() => null)) as {
            error?: { message: string };
          } | null;
          if (!res.ok) {
            onError(json?.error?.message ?? `Premium update failed (HTTP ${res.status})`);
            return;
          }
          setEditing(false);
          // Re-derive the brief with the new premium (deterministic refresh).
          onSaved();
        } catch (e) {
          onError(e instanceof Error ? e.message : 'Network error saving the premium');
        }
      });
    },
    [projectKey, pct, basis, onSaved, onError]
  );

  const textBtn: React.CSSProperties = {
    background: 'none',
    border: 'none',
    padding: 0,
    color: 'var(--color-text-secondary, #6b7280)',
    cursor: 'pointer',
    fontSize: 12,
    textDecoration: 'underline',
  };

  if (!editing) {
    const hasPremium = premium.premiumPct != null && premium.premiumPct !== 0;
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          fontSize: 12,
          color: 'var(--color-text-tertiary, #767b84)',
          padding: '0 2px',
          flexWrap: 'wrap',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: hasPremium
              ? 'var(--color-warning, #a16207)'
              : 'var(--color-text-quaternary, #9aa0a6)',
            flex: '0 0 auto',
          }}
        />
        <span>
          {hasPremium
            ? `Documented premium ${premium.premiumPct! > 0 ? '+' : ''}${premium.premiumPct}% vs closed anchor${premium.premiumBasis ? ` — ${premium.premiumBasis}` : ''}`
            : 'Price-taker — launch anchors to the strongest closed comp (no premium)'}
        </span>
        <button type="button" style={textBtn} disabled={disabled} onClick={() => setEditing(true)}>
          {hasPremium ? 'Edit' : 'Set premium'}
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
        color: 'var(--color-text-secondary, #6b7280)',
        padding: '0 2px',
        flexWrap: 'wrap',
      }}
    >
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        Premium
        <input
          type="number"
          value={pct}
          min={-20}
          max={50}
          step={0.5}
          onChange={(e) => setPct(e.target.value)}
          style={{
            width: 64,
            fontSize: 12,
            padding: '4px 6px',
            border: '1px solid var(--color-border-hairline, #c8c8c5)',
            borderRadius: 6,
          }}
        />
        %
      </label>
      <input
        type="text"
        value={basis}
        placeholder="Documented basis — named premium attributes (required for a premium)"
        onChange={(e) => setBasis(e.target.value)}
        style={{
          flex: '1 1 280px',
          minWidth: 220,
          fontSize: 12,
          padding: '4px 8px',
          border: '1px solid var(--color-border-hairline, #c8c8c5)',
          borderRadius: 6,
        }}
      />
      <button type="button" style={textBtn} disabled={saving} onClick={() => save(false)}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button type="button" style={textBtn} disabled={saving} onClick={() => save(true)}>
        Clear
      </button>
      <button type="button" style={textBtn} disabled={saving} onClick={() => setEditing(false)}>
        Cancel
      </button>
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
  updating,
  applying,
  showHistory,
  onToggleHistory,
  onGenerate,
  onUpdateComps,
  onApply,
}: {
  brief: PricingBriefView;
  briefHistory: PricingBriefView[];
  isEditor: boolean;
  generating: boolean;
  updating: boolean;
  applying: boolean;
  showHistory: boolean;
  onToggleHistory: () => void;
  onGenerate: () => void;
  onUpdateComps: () => void;
  onApply: (id: string) => void;
}) {
  // Apply button moved INTO the Recommendation hero card. This bar is just
  // metadata + Refresh now — slim, no card border, no double row.
  void applying;
  void onApply;
  void brief.status; // status badge dropped from this bar; lives in hero card instead

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        padding: '0 2px 4px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          fontSize: 12,
          color: 'var(--color-text-tertiary, #767b84)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span style={{ fontWeight: 700, color: 'var(--color-text-secondary, #6b7280)' }}>
          v{brief.version}
        </span>
        <span>·</span>
        <span>{date(brief.createdAt)}</span>
        <span>·</span>
        <span style={{ textTransform: 'capitalize' }}>{brief.phase}</span>
        <span>·</span>
        {brief.usedWebSearch ? (
          <Badge color="positive">Live MLS</Badge>
        ) : (
          <Badge color="warning">AI-estimated</Badge>
        )}
        {brief.dataGap && <Badge color="negative">Data gap</Badge>}
        {briefHistory.length > 1 && (
          <>
            <span>·</span>
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
      {isEditor && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Refresh re-derives the SAME number from the stored comps (stable). */}
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating || updating}
            title="Re-derive the recommendation from the stored comps (stable — the number only moves if the comps change)"
            style={{
              fontSize: 12,
              fontWeight: 400,
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid var(--color-border-hairline, #c8c8c5)',
              background: 'var(--color-surface-base, #fff)',
              color: 'var(--color-text-primary, #111)',
              cursor: generating ? 'wait' : 'pointer',
              opacity: generating || updating ? 0.6 : 1,
            }}
          >
            {generating ? 'Refreshing…' : 'Refresh'}
          </button>
          {/* The only action that pulls fresh web comps. */}
          <button
            type="button"
            onClick={onUpdateComps}
            disabled={updating || generating}
            title="Pull fresh comps from the market — the price moves only if the comps materially changed"
            style={{
              fontSize: 12,
              fontWeight: 400,
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid var(--color-border-hairline, #c8c8c5)',
              background: 'var(--color-surface-base, #fff)',
              color: 'var(--color-text-primary, #111)',
              cursor: updating ? 'wait' : 'pointer',
              opacity: updating || generating ? 0.6 : 1,
            }}
          >
            {updating ? 'Updating comps…' : 'Update comps from market'}
          </button>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Brief renderer — the actual content
// ────────────────────────────────────────────────────────────────────────────

function BriefRenderer({
  brief,
  citations,
  llmProvider,
  isApplied,
  hasError,
  generationError,
  isEditor,
  applying,
  onApply,
}: {
  brief: StrategyBrief;
  citations: PerplexityCitation[] | null;
  llmProvider?: 'anthropic' | 'perplexity';
  isApplied: boolean;
  hasError: boolean;
  generationError?: string | null;
  isEditor: boolean;
  applying: boolean;
  onApply: () => void;
}) {
  // Heuristic for "did the AI actually produce a usable recommendation?"
  // A fallback brief sets equal expected and prob-weighted margins to the
  // same number and writes a stub thesis — we treat that as untrustworthy.
  const hasUsableRecommendation =
    !hasError &&
    brief.recommendation.launchPriceUsd > 0 &&
    !!brief.recommendation.oneLineThesis &&
    brief.recommendation.oneLineThesis.indexOf('AI brief generation unavailable') === -1;

  // Sub-sections that depend on AI output. Suppress when we don't trust it.
  const hasMarketSentiment =
    hasUsableRecommendation &&
    (brief.marketSentiment.indicators.length > 0 || brief.marketSentiment.overallRead);
  const hasReductionLadder = hasUsableRecommendation && brief.reductionLadder.phases.length > 0;
  const hasScenarios = hasUsableRecommendation && brief.outcomeScenarios.scenarios.length > 0;
  const hasRisks = hasUsableRecommendation && brief.risks.length > 0;
  const hasWhy =
    hasUsableRecommendation &&
    (brief.whyThisNumber.whyNotHigher.length > 0 || brief.whyThisNumber.whyNotLower.length > 0);
  const hasFinalRec = hasUsableRecommendation && !!brief.finalRecommendation.icFraming;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {hasError && hasUsableRecommendation && <PartialErrorNote detail={generationError} />}
      {hasUsableRecommendation ? (
        <Recommendation
          rec={brief.recommendation}
          isApplied={isApplied}
          thesis={brief.recommendation.oneLineThesis}
          isEditor={isEditor}
          applying={applying}
          onApply={onApply}
        />
      ) : (
        <FailedRecommendationCard detail={generationError} />
      )}

      {/* V6.1.5 (T-PRC-4) — triangulation block sits above the brief proper on a data gap. */}
      {brief.triangulationBlock && <TriangulationSection block={brief.triangulationBlock} />}
      {/* V6.1.5 (T-PRC-5) — buyer-migration thesis (collapsed by default). */}
      {brief.buyerMigrationThesis && <BuyerMigrationSection thesis={brief.buyerMigrationThesis} />}

      {/* Breakeven thresholds are deterministic — always reliable. */}
      <BreakevenThresholds thresholds={brief.breakevenThresholds} />

      {hasUsableRecommendation && brief.quickMath.length > 0 && (
        <QuickMath rows={brief.quickMath} />
      )}

      {/* Comp evidence is partly real (comps came from research) — show always. */}
      <CompEvidence evidence={brief.compEvidence} />

      {/* V6.1.5 (T-PRC-6) — stuck-listing tracker (in-sub-cut actives sitting unsold). */}
      <StuckListings comps={brief.compEvidence.activeComps} />

      {hasMarketSentiment && <MarketSentiment sentiment={brief.marketSentiment} />}
      {hasReductionLadder && <ReductionLadder ladder={brief.reductionLadder} />}
      {hasScenarios && <OutcomeScenarios scenarios={brief.outcomeScenarios} />}
      {hasRisks && <RisksSection risks={brief.risks} />}
      {hasWhy && <WhyThisNumber section={brief.whyThisNumber} />}
      {hasFinalRec && <FinalRecommendation section={brief.finalRecommendation} />}
      <SourcesSection citations={citations} provider={llmProvider} />
    </div>
  );
}

// ── Failed-recommendation card ──────────────────────────────────────────────

function FailedRecommendationCard({ detail }: { detail?: string | null }) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          aria-hidden="true"
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: 'var(--color-warning, #a16207)',
            flex: '0 0 auto',
          }}
        />
        <SectionEyebrow label="Recommendation unavailable" />
      </div>
      <h2
        style={{
          margin: '8px 0 0',
          fontSize: 18,
          fontWeight: 700,
          color: 'var(--color-text-primary, #111)',
          letterSpacing: '-0.02em',
        }}
      >
        The market analysis didn’t finish this run.
      </h2>
      <p
        style={{
          margin: '8px 0 0',
          fontSize: 13,
          color: 'var(--color-text-secondary, #6b7280)',
          lineHeight: 1.6,
          maxWidth: 720,
        }}
      >
        The cost stack and breakeven thresholds below are exact — they’re computed directly from the
        project’s land and build costs, not the AI. Only the market read needs another pass; hit{' '}
        <strong style={{ fontWeight: 600, color: 'var(--color-text-primary, #111)' }}>
          Refresh
        </strong>{' '}
        at the top to retry.
      </p>
      {detail && (
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 12,
            color: 'var(--color-text-tertiary, #767b84)',
            lineHeight: 1.5,
          }}
        >
          {detail}
        </p>
      )}
    </Card>
  );
}

/**
 * Quiet one-line notice for the rare case where a usable recommendation exists
 * but generation hit a partial error. A small dot + muted text — never a banner.
 */
function PartialErrorNote({ detail }: { detail?: string | null }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        fontSize: 12,
        color: 'var(--color-text-tertiary, #767b84)',
        padding: '0 2px',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: 'var(--color-warning, #a16207)',
          flex: '0 0 auto',
        }}
      />
      <span>
        Generated with a partial error{detail ? `: ${detail}` : ''}. Refresh to regenerate.
      </span>
    </div>
  );
}

// ── Sources (V6.1.5 — Sonar citations, Hard Rule #6) ────────────────────────

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function SourcesSection({
  citations,
  provider,
}: {
  citations: PerplexityCitation[] | null;
  provider?: 'anthropic' | 'perplexity';
}) {
  if (!citations || citations.length === 0) return null;
  const seen = new Set<string>();
  const unique = citations.filter((c) => {
    if (!c.url || seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
  if (unique.length === 0) return null;
  return (
    <Card>
      <SectionEyebrow
        label={provider === 'perplexity' ? 'Sources · Perplexity Sonar' : 'Sources'}
      />
      <ol
        style={{
          margin: '10px 0 0',
          paddingLeft: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {unique.map((c) => (
          <li key={c.url} style={{ fontSize: 12, lineHeight: 1.5 }}>
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--color-accent-base, #131313)',
                textDecoration: 'underline',
                wordBreak: 'break-all',
              }}
            >
              {c.title || hostOf(c.url)}
            </a>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ── Triangulation (V6.1.5 T-PRC-4 — data-gap reconciliation) ────────────────

function TriangulationSection({ block }: { block: TriangulationBlock }) {
  const band = block.derived_band;
  const isTotal = band.per_sqft_or_total === 'total';
  const fmtBand = (n: number | undefined): string =>
    n == null ? '—' : isTotal ? usd(n, { compact: true }) : `$${Math.round(n).toLocaleString()}/SF`;
  return (
    <Card>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
      >
        <SectionEyebrow label="Triangulation — data gap" />
        <Badge color={block.gap_severity === 'red' ? 'negative' : 'warning'}>
          {block.gap_severity} gap
        </Badge>
      </div>
      <div style={{ marginTop: 8, fontSize: 13, color: 'var(--color-text-secondary, #6b7280)' }}>
        In-sub-cut closed {block.in_sub_cut_closed_count} · active {block.in_sub_cut_active_count}
        {block.adjacent_sub_cut_definition
          ? ` · adjacent sub-cut: ${block.adjacent_sub_cut_definition}`
          : ''}
      </div>
      {block.primary_anchor && (
        <div style={{ marginTop: 10, fontSize: 14, color: 'var(--color-text-primary, #111)' }}>
          <strong>Primary anchor:</strong> {block.primary_anchor.address} — $
          {Math.round(block.primary_anchor.price_per_sqft).toLocaleString()}/SF
          {block.primary_anchor.why_chosen ? ` — ${block.primary_anchor.why_chosen}` : ''}
        </div>
      )}
      {block.secondary_anchors.length > 0 && (
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
          {block.secondary_anchors.map((a) => (
            <li key={a.address}>
              {a.address} — ${Math.round(a.price_per_sqft).toLocaleString()}/SF
              {a.role ? ` (${a.role})` : ''}
            </li>
          ))}
        </ul>
      )}
      <div
        style={{
          marginTop: 12,
          fontSize: 15,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--color-text-primary, #111)',
        }}
      >
        Derived band: {fmtBand(band.low)} / {fmtBand(band.best)} / {fmtBand(band.high)}
      </div>
      {block.band_derivation_logic && (
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 13,
            lineHeight: 1.5,
            color: 'var(--color-text-primary, #111)',
          }}
        >
          {block.band_derivation_logic}
        </p>
      )}
      {block.unresolved_questions.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--color-text-tertiary, #767b84)',
            }}
          >
            Unresolved — partner reconciliation
          </div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>
            {block.unresolved_questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ── Stuck listings (V6.1.5 T-PRC-6 — DOM > 180 or relist >= 2) ──────────────

function StuckListings({ comps }: { comps: ResearchedComp[] }) {
  const stuck = comps.filter((c) => (c.domDays ?? 0) > 180 || (c.relistCount ?? 0) >= 2);
  if (stuck.length === 0) return null;
  return (
    <Card>
      <SectionEyebrow label="Stuck listings" />
      <div style={{ marginTop: 8, fontSize: 13, color: 'var(--color-text-secondary, #6b7280)' }}>
        In-sub-cut actives sitting unsold (DOM &gt; 180 or re-listed ≥ 2×) — a soft-market signal.
      </div>
      <ul
        style={{
          margin: '8px 0 0',
          padding: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {stuck.map((c) => (
          <li key={c.address} style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
            {c.address} · {c.domDays != null ? `${c.domDays} DOM` : 'DOM n/a'} ·{' '}
            {c.relistCount ? `${c.relistCount}× relist` : 'no relist'} ·{' '}
            {usd(c.salePriceUsd, { compact: true })}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ── Buyer-migration thesis (V6.1.5 T-PRC-5 — collapsed by default) ──────────

function BuyerMigrationSection({ thesis }: { thesis: BuyerMigrationThesis }) {
  const color =
    thesis.thesis_outcome === 'supported'
      ? 'positive'
      : thesis.thesis_outcome === 'rejected'
        ? 'negative'
        : 'warning';
  const psf = (n: number | undefined): string =>
    n == null ? '—' : `$${Math.round(n).toLocaleString()}/SF`;
  const anchorList = (comps: BuyerMigrationThesis['named_comps_supporting'], label: string) =>
    comps.length > 0 ? (
      <div style={{ marginTop: 10 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-text-tertiary, #767b84)',
          }}
        >
          {label}
        </div>
        <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>
          {comps.map((c) => (
            <li key={c.address}>
              {c.address} — {psf(c.price_per_sqft)}
              {c.why ? ` — ${c.why}` : ''}
            </li>
          ))}
        </ul>
      </div>
    ) : null;
  return (
    <Card>
      <details>
        <summary
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            justifyContent: 'space-between',
            flexWrap: 'wrap',
          }}
        >
          <SectionEyebrow label="Buyer-migration thesis" />
          <Badge color={color}>{thesis.thesis_outcome}</Badge>
        </summary>
        <div style={{ marginTop: 10 }}>
          {thesis.premium_vs_adjacent_pct != null && (
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary, #6b7280)' }}>
              Proposed {psf(thesis.proposed_midpoint_per_sqft)} · adjacent median{' '}
              {psf(thesis.adjacent_sub_cut_median_per_sqft)} · premium{' '}
              {Math.round(thesis.premium_vs_adjacent_pct)}%
            </div>
          )}
          <p
            style={{
              margin: '10px 0 0',
              fontSize: 14,
              lineHeight: 1.5,
              color: 'var(--color-text-primary, #111)',
            }}
          >
            {thesis.reasoning}
          </p>
          {anchorList(thesis.named_comps_supporting, 'Supporting')}
          {anchorList(thesis.named_comps_against, 'Against')}
          {thesis.thesis_outcome === 'rejected' && thesis.walkback && (
            <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--color-warning, #a16207)' }}>
              <strong>Walkback:</strong> {thesis.walkback}
            </p>
          )}
        </div>
      </details>
    </Card>
  );
}

// ── Recommendation card ─────────────────────────────────────────────────────

function Recommendation({
  rec,
  isApplied,
  thesis,
  isEditor,
  applying,
  onApply,
}: {
  rec: StrategyBrief['recommendation'];
  isApplied: boolean;
  thesis: string;
  isEditor: boolean;
  applying: boolean;
  onApply: () => void;
}) {
  // Only show probability-weighted as a separate metric if it materially
  // differs from margin-at-ask (avoids the duplicate "+8.7% / +8.7%" look).
  const askMargin = rec.expectedMarginPct;
  const pwMargin = rec.probWeightedMarginPct;
  const showPwSeparately =
    pwMargin !== null && askMargin !== null && Math.abs(pwMargin - askMargin) >= 0.005; // ≥ 50 bps

  return (
    <Card accent>
      <SectionEyebrow label="Recommendation" />
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 20,
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          marginTop: 10,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              color: 'var(--color-text-primary, #111)',
              letterSpacing: '-0.03em',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.05,
            }}
          >
            {usd(rec.launchPriceUsd)}
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 13,
              color: 'var(--color-text-secondary, #6b7280)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            launch · {psfFmt(rec.psfAtLaunch)}
          </div>
          {rec.band && rec.band.high > rec.band.low && (
            <div
              style={{
                marginTop: 2,
                fontSize: 12,
                color: 'var(--color-text-tertiary, #767b84)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              Band {psfFmt(rec.band.low)} – {psfFmt(rec.band.high)} AG
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {rec.classification && (
            <Badge color="neutral">
              {CLASSIFICATION_LABEL[rec.classification] ?? rec.classification}
            </Badge>
          )}
          {isApplied && <Badge color="positive">Applied to financial model</Badge>}
        </div>
      </div>

      <p
        style={{
          margin: '18px 0 0',
          fontSize: 15,
          color: 'var(--color-text-primary, #111)',
          lineHeight: 1.5,
          fontWeight: 400,
        }}
      >
        {thesis}
      </p>

      {rec.derivationBasis && (
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 12,
            color: 'var(--color-text-tertiary, #767b84)',
            lineHeight: 1.5,
          }}
        >
          {rec.derivationBasis}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 24,
          marginTop: 18,
          paddingTop: 16,
          borderTop: '1px solid var(--color-border-hairline, #c8c8c5)',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 32,
            flex: '1 1 auto',
            flexWrap: 'wrap',
          }}
        >
          <Metric label="Margin at ask" value={pct(askMargin)} marginColor={askMargin} />
          {showPwSeparately && (
            <Metric label="Probability-weighted" value={pct(pwMargin)} marginColor={pwMargin} />
          )}
        </div>
        {isEditor && !isApplied && rec.psfAtLaunch > 0 && (
          <button
            type="button"
            onClick={onApply}
            disabled={applying}
            style={{
              fontSize: 13,
              fontWeight: 700,
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--color-accent-base, #131313)',
              color: '#fff',
              cursor: applying ? 'wait' : 'pointer',
              opacity: applying ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {applying ? 'Applying…' : 'Apply to project →'}
          </button>
        )}
      </div>
    </Card>
  );
}

// ── Breakeven thresholds ────────────────────────────────────────────────────

function BreakevenThresholds({ thresholds }: { thresholds: StrategyBrief['breakevenThresholds'] }) {
  return (
    <Card>
      <SectionHeader label="Cost stack & breakeven" />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 8,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <InlineMetric label="Total dev cost" value={usd(thresholds.totalDevCostUsd)} />
        <InlineMetric
          label="Breakeven"
          value={usd(thresholds.breakevenExitUsd)}
          sub={psfFmt(thresholds.breakevenPsf)}
        />
        <InlineMetric label="5% margin" value={usd(thresholds.margin5ExitUsd)} />
        <InlineMetric label="10% margin" value={usd(thresholds.margin10ExitUsd)} strong />
        <InlineMetric label="15% margin" value={usd(thresholds.margin15ExitUsd)} />
      </div>
    </Card>
  );
}

/**
 * Inline metric — quieter alternative to the bordered Tile. Used inside
 * cards where multiple numbers sit side-by-side and adding borders to each
 * would create nested-border noise.
 */
function InlineMetric({
  label,
  value,
  sub,
  strong,
}: {
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-tertiary, #767b84)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: strong ? 600 : 500,
          color: 'var(--color-text-primary, #111)',
          fontVariantNumeric: 'tabular-nums',
          marginTop: 2,
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--color-text-tertiary, #767b84)',
            marginTop: 1,
          }}
        >
          {sub}
        </div>
      )}
    </div>
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
              {['Scenario', 'Exit', '$/SF', 'Net after closing', 'Profit', 'Margin', 'Read'].map(
                (h, i) => (
                  <th key={h} style={thStyle(i > 0 ? 'right' : 'left')}>
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                style={{ borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)' }}
              >
                <td style={tdStyle()}>{r.scenario}</td>
                <td style={tdStyle('right', true)}>{usd(r.exitUsd)}</td>
                <td style={tdStyle('right', true)}>{psfFmt(r.psf)}</td>
                <td style={tdStyle('right', true)}>{usd(r.netAfterClosingUsd)}</td>
                <td
                  style={{
                    ...tdStyle('right', true),
                    color:
                      r.profitUsd < 0
                        ? 'var(--color-negative, #b91c1c)'
                        : 'var(--color-text-primary, #111)',
                  }}
                >
                  {usd(r.profitUsd)}
                </td>
                <td
                  style={{
                    ...tdStyle('right', true),
                    fontWeight: 700,
                    color: marginColor(r.marginPct),
                  }}
                >
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
  // Suppress this card entirely when the engine returned nothing useful —
  // a stub "research is temporarily unavailable" narrative + 0 comps adds
  // visual weight with zero information.
  const hasAnyComp = evidence.closedComps.length > 0 || evidence.activeComps.length > 0;
  if (!hasAnyComp) return null;

  const badgeBits: string[] = [];
  if (evidence.closedComps.length > 0) badgeBits.push(`${evidence.closedComps.length} closed`);
  if (evidence.activeComps.length > 0) badgeBits.push(`${evidence.activeComps.length} active`);
  if (evidence.medianPsf) badgeBits.push(`median ${psfFmt(evidence.medianPsf)}`);

  return (
    <Card>
      <SectionHeader label="Comp evidence" badge={badgeBits.join(' · ')} />
      {evidence.dataGap && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 12,
            color: 'var(--color-text-tertiary, #767b84)',
            marginBottom: 10,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: 'var(--color-negative, #b91c1c)',
              flex: '0 0 auto',
            }}
          />
          Fewer than 3 closed comps in sub-cut — less reliable
        </div>
      )}
      {evidence.narrativeSummary && (
        <p
          style={{
            fontSize: 13,
            color: 'var(--color-text-secondary, #6b7280)',
            margin: '0 0 12px',
            lineHeight: 1.6,
          }}
        >
          {evidence.narrativeSummary}
        </p>
      )}
      {evidence.closedComps.length > 0 && <CompTable label="Closed" comps={evidence.closedComps} />}
      {evidence.activeComps.length > 0 && (
        <div style={{ marginTop: evidence.closedComps.length > 0 ? 14 : 0 }}>
          <CompTable label="Active (ceiling)" comps={evidence.activeComps} />
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
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-tertiary, #767b84)',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)' }}>
              {['Address', 'Date', 'SF', 'Price', '$/SF'].map((h, i) => (
                <th key={h} style={thStyle(i >= 2 ? 'right' : 'left')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comps.map((c, i) => (
              <tr
                key={i}
                style={{ borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)' }}
              >
                <td style={{ ...tdStyle(), paddingTop: 6, paddingBottom: 6 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <CompProvenanceBadge provenance={researchedCompProvenance(c)} variant="dot" />
                    {c.sourceUrl ? (
                      <a
                        href={c.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--color-text-primary, #111)', textDecoration: 'none' }}
                        title={`Source: ${c.sourceName}`}
                      >
                        {c.address}
                      </a>
                    ) : (
                      <span title={`Source: ${c.sourceName}`}>{c.address}</span>
                    )}
                  </span>
                </td>
                <td
                  style={{
                    ...tdStyle(),
                    paddingTop: 6,
                    paddingBottom: 6,
                    color: 'var(--color-text-tertiary, #767b84)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.closingDate ?? 'active'}
                </td>
                <td style={{ ...tdStyle('right', true), paddingTop: 6, paddingBottom: 6 }}>
                  {c.agSqft.toLocaleString()}
                </td>
                <td style={{ ...tdStyle('right', true), paddingTop: 6, paddingBottom: 6 }}>
                  {usd(c.salePriceUsd, { compact: true })}
                </td>
                <td
                  style={{
                    ...tdStyle('right', true),
                    paddingTop: 6,
                    paddingBottom: 6,
                    fontWeight: 700,
                  }}
                >
                  {psfFmt(c.psf)}
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
                <tr
                  key={i}
                  style={{ borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)' }}
                >
                  <td style={tdStyle()}>{ind.indicator}</td>
                  <td style={{ ...tdStyle(), fontWeight: 400 }}>{ind.reading}</td>
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
      <p
        style={{
          fontSize: 12,
          color: 'var(--color-text-secondary, #6b7280)',
          margin: '0 0 14px',
          lineHeight: 1.5,
        }}
      >
        Pre-commit these triggers. The discipline is: reduce ON the trigger, not before. Multiple
        early cuts signal weakness.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ladder.phases.map((p: ReductionPhase, i) => (
          <LadderRow key={i} phase={p} />
        ))}
        <div
          style={{
            marginTop: 8,
            padding: '12px 14px',
            background: 'var(--color-surface-sunken, #f4f4f2)',
            border: '1px solid var(--color-border-hairline, #c8c8c5)',
            borderRadius: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-negative, #b91c1c)',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: 'var(--color-negative, #b91c1c)',
                    flex: '0 0 auto',
                  }}
                />
                Walk-away floor
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  marginTop: 2,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {usd(ladder.walkAwayFloor.priceUsd)} · {psfFmt(ladder.walkAwayFloor.psf)} ·{' '}
                {pct(ladder.walkAwayFloor.marginPct)}
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
        gridTemplateColumns:
          'minmax(70px, 1fr) minmax(120px, 1fr) minmax(80px, 1fr) minmax(70px, 1fr) minmax(200px, 2fr)',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-tertiary, #767b84)',
        }}
      >
        {phase.label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {usd(phase.priceUsd)}
      </div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--color-text-secondary, #6b7280)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {psfFmt(phase.psf)}
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: marginColor(phase.marginPct),
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {pct(phase.marginPct)}
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #6b7280)', lineHeight: 1.4 }}>
        <strong style={{ color: 'var(--color-text-primary, #111)', fontWeight: 400 }}>
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
      <p
        style={{
          fontSize: 12,
          color: 'var(--color-text-tertiary, #767b84)',
          margin: '12px 0 0',
          lineHeight: 1.5,
        }}
      >
        Probability-weighted expected exit:{' '}
        <strong
          style={{ color: 'var(--color-text-primary, #111)', fontVariantNumeric: 'tabular-nums' }}
        >
          {usd(scenarios.probWeightedExpectedExitUsd)}
        </strong>
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
        gridTemplateColumns:
          'minmax(80px, 1fr) minmax(220px, 3fr) minmax(100px, 1fr) minmax(70px, 1fr) minmax(50px, 0.5fr)',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700 }}>{scenario.name}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #6b7280)', lineHeight: 1.4 }}>
        {scenario.description}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {usd(scenario.exitUsd)}
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: marginColor(scenario.marginPct),
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {pct(scenario.marginPct)}
      </div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--color-text-tertiary, #767b84)',
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'right',
        }}
      >
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
              <tr
                key={i}
                style={{ borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)' }}
              >
                <td style={{ ...tdStyle(), fontWeight: 700, verticalAlign: 'top' }}>{r.risk}</td>
                <td
                  style={{
                    ...tdStyle(),
                    color: 'var(--color-text-secondary, #6b7280)',
                    verticalAlign: 'top',
                  }}
                >
                  {r.impact}
                </td>
                <td
                  style={{
                    ...tdStyle(),
                    color: 'var(--color-text-primary, #111)',
                    verticalAlign: 'top',
                  }}
                >
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
        <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.5 }}>{section.headline}</p>
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
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-tertiary, #767b84)',
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <ul
        style={{
          margin: 0,
          padding: '0 0 0 16px',
          listStyle: 'disc',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
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
        <ol
          style={{
            margin: 0,
            padding: '0 0 0 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
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
              <th key={h} style={thStyle('left')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {briefs.map((b) => (
            <tr
              key={b.id}
              style={{ borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)' }}
            >
              <td style={{ ...tdStyle(), fontWeight: 700 }}>
                v{b.version}
                {b.id === currentId ? ' (current)' : ''}
              </td>
              <td style={tdStyle()}>
                <StatusBadge status={b.status} />
              </td>
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

// ────────────────────────────────────────────────────────────────────────────
// Reusable primitives
// ────────────────────────────────────────────────────────────────────────────

function Card({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div
      style={{
        background: 'var(--color-surface-raised, #fff)',
        border: accent
          ? '1.5px solid var(--color-accent-base, #131313)'
          : '1px solid var(--color-border-hairline, #c8c8c5)',
        borderRadius: 'var(--ja-card-radius)',
        padding: accent ? 20 : 16,
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
          fontWeight: 700,
          color: 'var(--color-text-primary, #111)',
        }}
      >
        {label}
      </h2>
      {badge && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 400,
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

function SectionEyebrow({ label }: { label: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--color-text-tertiary, #767b84)',
      }}
    >
      {label}
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
          fontWeight: 700,
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
          fontWeight: 700,
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

/**
 * Atlas-standard status badge: a small severity DOT + monochrome uppercase
 * label. No fills, no coloured borders — colour is carried only by the 6px dot,
 * so a screen full of statuses stays calm and near-monochrome (the platform
 * "near-black + single accent" aesthetic). Dot hues come from the shared
 * StatusDot palette (token-based). Replaces the old filled raw-hex pills.
 */
function Badge({
  color,
  children,
}: {
  color: 'positive' | 'warning' | 'negative' | 'neutral';
  children: React.ReactNode;
}) {
  const dot: Record<typeof color, string> = {
    positive: 'var(--color-positive, #15803d)',
    warning: 'var(--color-warning, #a16207)',
    negative: 'var(--color-negative, #b91c1c)',
    neutral: 'var(--color-text-quaternary, #9aa0a6)',
  };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--color-text-tertiary, #767b84)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: dot[color],
          flex: '0 0 auto',
        }}
      />
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
        background: 'var(--color-surface-raised, #fff)',
        border: '1px solid var(--color-border-hairline, #c8c8c5)',
        borderRadius: 8,
        color: 'var(--color-text-primary, #111)',
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: 'var(--color-negative, #b91c1c)',
            flex: '0 0 auto',
          }}
        />
        {message}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--color-text-tertiary, #767b84)',
          cursor: 'pointer',
          fontSize: 14,
          padding: 0,
          lineHeight: 1,
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
    fontWeight: 700,
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
  if (m >= 0.1) return 'var(--color-positive, #15803d)';
  if (m >= 0) return 'var(--color-warning, #a16207)';
  return 'var(--color-negative, #b91c1c)';
}
