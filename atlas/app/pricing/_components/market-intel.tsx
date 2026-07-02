'use client';

/**
 * D-026 — Market intelligence (borderless layout).
 *
 * Single unified section that bundles KPIs + $/SF bar chart + recent comps.
 * One dropdown filter scopes everything; one Refresh button (with optional
 * custom-sub-market input) populates the data.
 *
 * Layout philosophy: no nested cards or borders inside this section. The page
 * separates sections with hairlines and whitespace, not nested boxes.
 */

import { useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { CompView } from '@/lib/repos/comps';
import type { MarketSubCut } from '@/lib/db/schema/markets';
import { JunoThinking } from '@/components/brand/JunoThinking';
import { CompProvenanceBadge } from './comp-provenance-badge';
import { StatusDot } from '@/components/feedback/StatusDot';

interface MarketIntelProps {
  canEdit: boolean;
  windowDays: number;
  closedInWindow: CompView[];
  priorClosedInWindow: CompView[];
  activeAll: CompView[];
  subCuts: MarketSubCut[];
  totalCompsInLibrary: number;
  /** T100.2 — newest closed comp is older than the staleness threshold. */
  isStale: boolean;
  /** YYYY-MM-DD of the freshest closed comp (for the banner copy). */
  newestClosedDate: string | null;
}

interface KpiBucket {
  avgPsf: number | null;
  /** Min closed $/SF in the bucket — paired with avgPsf for the range hint. */
  lowPsf: number | null;
  /** Max closed $/SF in the bucket — paired with avgPsf for the range hint. */
  highPsf: number | null;
  medianDom: number | null;
  closedCount: number;
  activeCount: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ────────────────────────────────────────────────────────────────────────────

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}
function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}
function computeKpis(closed: CompView[], active: CompView[]): KpiBucket {
  const psfs = closed.map((c) => c.psf).filter((n): n is number => n != null && n > 0);
  const doms = closed.map((c) => c.domDays).filter((n): n is number => n != null && n >= 0);
  return {
    avgPsf: psfs.length > 0 ? Math.round(avg(psfs) ?? 0) : null,
    lowPsf: psfs.length > 0 ? Math.round(Math.min(...psfs)) : null,
    highPsf: psfs.length > 0 ? Math.round(Math.max(...psfs)) : null,
    medianDom: doms.length > 0 ? Math.round(median(doms) ?? 0) : null,
    closedCount: closed.length,
    activeCount: active.length,
  };
}
function pctDelta(curr: number | null, prior: number | null): number | null {
  if (curr === null || prior === null || prior === 0) return null;
  return (curr - prior) / prior;
}
/**
 * Only show a YoY indicator when BOTH periods have enough data for the
 * comparison to be meaningful. Avoids the "▼ 100.0% YoY" alarmism when the
 * current period happens to have zero comps because of an AI-data-recency
 * gap that has nothing to do with the actual market.
 */
function meaningfulYoY(
  delta: number | null,
  currCount: number,
  priorCount: number,
  minCount = 3
): number | null {
  if (delta === null) return null;
  if (currCount < minCount || priorCount < minCount) return null;
  return delta;
}
function formatUsd(n: number | null | undefined, compact = false): string {
  if (n == null) return '—';
  if (compact && Math.abs(n) >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`;
  }
  if (compact && Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}
function formatDelta(d: number | null): string | null {
  if (d === null) return null;
  return `${Math.abs(d * 100).toFixed(1)}% YoY`;
}
function prettyLabel(key: string): string {
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Honest data-range label. Shows the actual span of the closed-comp sample
 * instead of "last N days", which is misleading when AI-returned comps are
 * 12-24 months old (training data is rarely fresher than ~12 months back).
 */
function formatDataRange(oldest: string | null, newest: string | null): string {
  if (!oldest || !newest) return 'No closed comps yet';
  const fmt = (d: string) => {
    const date = new Date(d + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  };
  if (oldest === newest) return `Comps from ${fmt(oldest)}`;
  return `Comps from ${fmt(oldest)} – ${fmt(newest)}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

const ALL_SUBCUTS = '__all__';

export function MarketIntel({
  canEdit,
  windowDays: _windowDays,
  closedInWindow,
  priorClosedInWindow,
  activeAll,
  subCuts,
  totalCompsInLibrary,
  isStale,
  newestClosedDate,
}: MarketIntelProps) {
  // Window is intentionally NOT displayed — the actual data-range label
  // (formatDataRange) is honest; "last N days" can be misleading when AI
  // returns older comps. Keep the prop in the API for future re-use.
  void _windowDays;
  const router = useRouter();
  const [filter, setFilter] = useState<string>(ALL_SUBCUTS);

  // Refresh state
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error' | null>(null);

  // Custom sub-market form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [customLabel, setCustomLabel] = useState('');

  const doRefresh = useCallback(
    async (customSubCutLabel?: string) => {
      setRefreshing(true);
      setFeedback(null);
      setFeedbackTone(null);
      try {
        const res = await fetch('/api/pricing/market-research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(customSubCutLabel ? { customSubCutLabel } : {}),
        });
        const json = (await res.json()) as
          | {
              data: {
                subCutsResearched: number;
                totalCompsFound: number;
                totalInserted: number;
                totalSkippedDupes: number;
                totalFailed: number;
                firstError: string | null;
              };
            }
          | { error: { message: string } };
        if (!res.ok || 'error' in json) {
          const msg = 'error' in json ? json.error.message : `HTTP ${res.status}`;
          setFeedback(`Refresh failed: ${msg}`);
          setFeedbackTone('error');
          return;
        }
        const {
          subCutsResearched,
          totalCompsFound,
          totalInserted,
          totalSkippedDupes,
          totalFailed,
          firstError,
        } = json.data;
        if (totalFailed > 0) {
          setFeedback(
            `Researched ${subCutsResearched} sub-cut${subCutsResearched === 1 ? '' : 's'} · found ${totalCompsFound} comps · added ${totalInserted} new · ${totalFailed} failed to save (${firstError ?? 'unknown'})`
          );
          setFeedbackTone('error');
        } else {
          setFeedback(
            `Researched ${subCutsResearched} sub-cut${subCutsResearched === 1 ? '' : 's'} · found ${totalCompsFound} comps · added ${totalInserted} new${totalSkippedDupes > 0 ? ` · ${totalSkippedDupes} already in library` : ''}.`
          );
          setFeedbackTone('success');
        }
        router.refresh();
      } catch (e) {
        setFeedback(`Refresh failed: ${e instanceof Error ? e.message : 'unknown error'}`);
        setFeedbackTone('error');
      } finally {
        setRefreshing(false);
      }
    },
    [router]
  );

  const onAddSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!customLabel.trim()) return;
      const label = customLabel.trim();
      setShowAddForm(false);
      setCustomLabel('');
      void doRefresh(label);
    },
    [customLabel, doRefresh]
  );

  // Build the merged sub-cut list: seeded markets + any sub_cut_keys that
  // appear in the data (catches custom-researched markets). De-duped by key.
  const allSubCuts = useMemo(() => {
    const seen = new Map<string, string>();
    for (const sc of subCuts) seen.set(sc.key, sc.label);
    for (const c of [...closedInWindow, ...activeAll]) {
      if (!seen.has(c.subCutKey)) seen.set(c.subCutKey, prettyLabel(c.subCutKey));
    }
    return Array.from(seen.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [subCuts, closedInWindow, activeAll]);

  // Apply filter
  const closedFiltered =
    filter === ALL_SUBCUTS ? closedInWindow : closedInWindow.filter((c) => c.subCutKey === filter);
  const activeFiltered =
    filter === ALL_SUBCUTS ? activeAll : activeAll.filter((c) => c.subCutKey === filter);
  const priorFiltered =
    filter === ALL_SUBCUTS
      ? priorClosedInWindow
      : priorClosedInWindow.filter((c) => c.subCutKey === filter);

  const current = useMemo(
    () => computeKpis(closedFiltered, activeFiltered),
    [closedFiltered, activeFiltered]
  );
  const prior = useMemo(() => computeKpis(priorFiltered, []), [priorFiltered]);
  // Suppress YoY chips when either period is too thin — meaningless and alarmist.
  const deltaPsf = meaningfulYoY(
    pctDelta(current.avgPsf, prior.avgPsf),
    current.closedCount,
    prior.closedCount
  );
  const deltaDom = meaningfulYoY(
    pctDelta(current.medianDom, prior.medianDom),
    current.closedCount,
    prior.closedCount
  );
  const deltaClosed = meaningfulYoY(
    pctDelta(current.closedCount, prior.closedCount),
    current.closedCount,
    prior.closedCount
  );

  // Bar chart data — always portfolio-wide
  const psfBySubCut = useMemo(() => {
    const bySubCut = new Map<string, number[]>();
    for (const c of closedInWindow) {
      if (!c.psf || c.psf <= 0) continue;
      const arr = bySubCut.get(c.subCutKey) ?? [];
      arr.push(c.psf);
      bySubCut.set(c.subCutKey, arr);
    }
    return Array.from(bySubCut.entries())
      .map(([subCutKey, psfs]) => ({
        subCutKey,
        medianPsf: Math.round(median(psfs) ?? 0),
        closedCount: psfs.length,
      }))
      .sort((a, b) => b.medianPsf - a.medianPsf);
  }, [closedInWindow]);
  const maxPsf = Math.max(...psfBySubCut.map((r) => r.medianPsf), 1);

  const labelMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const sc of allSubCuts) m.set(sc.key, sc.label);
    return m;
  }, [allSubCuts]);

  const recentFeed = closedFiltered.slice(0, 10);
  const filterLabel = filter === ALL_SUBCUTS ? 'all sub-markets' : (labelMap.get(filter) ?? filter);

  // What's the actual date range of comps in the current filter? Communicates
  // freshness honestly — a "last 18 months" window is useless if every comp
  // is from 18 months ago.
  const closingDates = closedFiltered
    .map((c) => c.closingDate)
    .filter((d): d is string => !!d)
    .sort();
  const oldestClosing = closingDates[0] ?? null;
  const newestClosing = closingDates[closingDates.length - 1] ?? null;
  const dataRangeLabel = formatDataRange(oldestClosing, newestClosing);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 700,
              color: 'var(--color-text-primary, #111)',
              letterSpacing: '-0.015em',
            }}
          >
            Market intelligence
          </h2>
          <p
            style={{
              margin: '2px 0 0',
              fontSize: 12,
              color: 'var(--color-text-tertiary, #767b84)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {dataRangeLabel} · {totalCompsInLibrary} comps in library · viewing {filterLabel}
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              fontSize: 12,
              fontWeight: 400,
              padding: '6px 28px 6px 12px',
              borderRadius: 8,
              border: '1px solid var(--color-border-hairline, #c8c8c5)',
              background: 'var(--color-surface-base, #fff)',
              color: 'var(--color-text-primary, #111)',
              cursor: 'pointer',
              appearance: 'none',
              backgroundImage:
                "url(\"data:image/svg+xml;charset=utf-8,%3Csvg width='10' height='6' viewBox='0 0 10 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23767b84' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 10px center',
              minWidth: 200,
            }}
          >
            <option value={ALL_SUBCUTS}>All sub-markets</option>
            {allSubCuts.map((sc) => (
              <option key={sc.key} value={sc.key}>
                {sc.label}
              </option>
            ))}
          </select>

          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => doRefresh()}
                disabled={refreshing}
                className={refreshing ? 'juno-pricing-pulse' : ''}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  fontWeight: 400,
                  padding: refreshing ? '4px 10px 4px 6px' : '6px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border-hairline, #c8c8c5)',
                  background: refreshing
                    ? 'var(--color-surface-sunken, #fafaf8)'
                    : 'var(--color-surface-base, #fff)',
                  color: 'var(--color-text-primary, #111)',
                  cursor: refreshing ? 'wait' : 'pointer',
                }}
              >
                {refreshing ? (
                  <>
                    <JunoThinking size={18} />
                    <span>Researching market… (~30s)</span>
                  </>
                ) : (
                  'Refresh data'
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm((s) => !s)}
                disabled={refreshing}
                style={{
                  fontSize: 12,
                  fontWeight: 400,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border-hairline, #c8c8c5)',
                  background: 'var(--color-surface-base, #fff)',
                  color: 'var(--color-text-primary, #111)',
                  cursor: refreshing ? 'wait' : 'pointer',
                }}
              >
                {showAddForm ? 'Cancel' : '+ Add sub-market'}
              </button>
            </>
          )}
        </div>
      </div>

      {showAddForm && (
        <form
          onSubmit={onAddSubmit}
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
            padding: 12,
            background: 'var(--color-surface-sunken, #fafaf8)',
            border: '1px dashed var(--color-border-hairline, #c8c8c5)',
            borderRadius: 8,
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary, #6b7280)' }}>
            Research a new sub-market:
          </span>
          <input
            type="text"
            placeholder="e.g. Aspen, CO · Miami Beach · Park City"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            autoFocus
            style={{
              flex: 1,
              minWidth: 200,
              fontSize: 12,
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid var(--color-border-hairline, #c8c8c5)',
              background: 'var(--color-surface-base, #fff)',
              color: 'var(--color-text-primary, #111)',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={!customLabel.trim() || refreshing}
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: '6px 12px',
              borderRadius: 6,
              border: 'none',
              background: 'var(--color-accent-base, #131313)',
              color: '#fff',
              cursor: customLabel.trim() ? 'pointer' : 'not-allowed',
              opacity: customLabel.trim() ? 1 : 0.5,
            }}
          >
            Research
          </button>
        </form>
      )}

      {feedback && (
        <p
          role="status"
          style={{
            margin: 0,
            fontSize: 11,
            color:
              feedbackTone === 'error'
                ? 'var(--color-negative, #b91c1c)'
                : 'var(--color-positive, #15803d)',
          }}
        >
          {feedback}
        </p>
      )}

      {/* T113 — stale-data banner replaced by StatusDot (V6.1). */}
      {isStale && newestClosedDate && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <StatusDot
            severity="warning"
            title="Market data may be stale"
            message={
              'Newest closed comp is from ' +
              new Date(newestClosedDate + 'T00:00:00Z').toLocaleDateString('en-US', {
                month: 'short',
                year: 'numeric',
                timeZone: 'UTC',
              }) +
              '. Recommendations may underweight recent market movement.'
            }
            action={
              canEdit
                ? {
                    label: refreshing ? 'Refreshing…' : 'Refresh data now',
                    onClick: () => doRefresh(),
                  }
                : undefined
            }
          />
          <span style={{ fontSize: 12, color: 'var(--color-warning, #a16207)' }}>
            Market intelligence data may be stale
          </span>
        </span>
      )}

      {/* KPI strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 16,
        }}
      >
        <KpiTile
          label="Avg $/SF"
          value={current.avgPsf !== null ? `$${current.avgPsf.toLocaleString()}` : '—'}
          delta={deltaPsf}
          tone="higher-better"
          sub={
            current.avgPsf === null
              ? 'no closed comps'
              : current.lowPsf !== null &&
                  current.highPsf !== null &&
                  current.lowPsf !== current.highPsf
                ? `range $${current.lowPsf.toLocaleString()} – $${current.highPsf.toLocaleString()}`
                : 'closed in window'
          }
        />
        <KpiTile
          label="Median DOM"
          value={current.medianDom !== null ? `${current.medianDom} d` : '—'}
          delta={deltaDom}
          tone="lower-better"
          sub={current.medianDom === null ? 'no DOM data yet' : 'days on market'}
        />
        <KpiTile
          label="Closed sales"
          value={current.closedCount.toLocaleString()}
          delta={deltaClosed}
          tone="higher-better"
          sub="in window"
        />
        <KpiTile
          label="Active listings"
          value={current.activeCount.toLocaleString()}
          sub="currently on market"
        />
      </div>

      <Divider />

      {/* Bar chart */}
      <div>
        <SubHeader
          label="$/SF by sub-market"
          hint={
            psfBySubCut.length === 0
              ? null
              : filter !== ALL_SUBCUTS
                ? `click bars to switch focus`
                : `click a bar to filter`
          }
        />
        {psfBySubCut.length === 0 ? (
          <EmptyLine
            copy={
              canEdit
                ? 'Refresh market data above to populate the chart.'
                : 'No closed comps in window yet.'
            }
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {psfBySubCut.map((r) => {
              const label = labelMap.get(r.subCutKey) ?? prettyLabel(r.subCutKey);
              const widthPct = Math.max(2, (r.medianPsf / maxPsf) * 100);
              const isSelected = filter === r.subCutKey;
              const isDimmed = filter !== ALL_SUBCUTS && !isSelected;
              return (
                <button
                  key={r.subCutKey}
                  type="button"
                  onClick={() => setFilter(isSelected ? ALL_SUBCUTS : r.subCutKey)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(180px, 1fr) 3fr minmax(120px, auto)',
                    gap: 12,
                    alignItems: 'center',
                    fontSize: 12,
                    background: 'transparent',
                    border: 'none',
                    padding: '2px 0',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'inherit',
                    opacity: isDimmed ? 0.4 : 1,
                    transition: 'opacity 120ms ease',
                  }}
                >
                  <span
                    style={{
                      color: 'var(--color-text-primary, #111)',
                      fontWeight: isSelected ? 600 : 400,
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
                      height: 16,
                      background: 'var(--color-surface-sunken, #fafaf8)',
                      borderRadius: 4,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${widthPct}%`,
                        background: isSelected
                          ? 'var(--color-positive, #15803d)'
                          : 'var(--color-accent-base, #131313)',
                        transition: 'width 200ms ease, background 120ms ease',
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--color-text-primary, #111)',
                      fontWeight: 700,
                      textAlign: 'right',
                    }}
                  >
                    ${r.medianPsf.toLocaleString()}{' '}
                    <span
                      style={{
                        fontWeight: 400,
                        color: 'var(--color-text-tertiary, #767b84)',
                      }}
                    >
                      · {r.closedCount}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Divider />

      {/* Recent comps */}
      <div>
        <SubHeader
          label="Recent closed comps"
          hint={
            filter === ALL_SUBCUTS
              ? `last ${recentFeed.length}`
              : `last ${recentFeed.length} in ${filterLabel}`
          }
        />
        {recentFeed.length === 0 ? (
          <EmptyLine
            copy={
              filter === ALL_SUBCUTS
                ? 'No closed comps in window yet.'
                : `No closed comps in ${filterLabel} in window.`
            }
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)' }}>
                  {['Date', 'Address', 'Sub-market', 'SF', 'Price', '$/SF'].map((h, i) => (
                    <th key={h} style={thStyle(i >= 3 ? 'right' : 'left')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentFeed.map((c) => (
                  <tr
                    key={c.id}
                    style={{ borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)' }}
                  >
                    <td style={tdStyle('left', { tertiary: true })}>{c.closingDate ?? '—'}</td>
                    <td style={tdStyle()}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <CompProvenanceBadge provenance={c.provenance} variant="dot" />
                        {c.address}
                      </span>
                    </td>
                    <td style={tdStyle('left', { tertiary: true })}>
                      {labelMap.get(c.subCutKey) ?? prettyLabel(c.subCutKey)}
                    </td>
                    <td style={tdStyle('right', { tabular: true })}>{c.agSqft.toLocaleString()}</td>
                    <td style={tdStyle('right', { tabular: true })}>
                      {c.salePriceCents !== null ? formatUsd(c.salePriceCents / 100, true) : '—'}
                    </td>
                    <td style={tdStyle('right', { tabular: true, strong: true })}>
                      {c.psf ? `$${Math.round(c.psf).toLocaleString()}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Primitives
// ────────────────────────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  delta,
  tone,
  sub,
}: {
  label: string;
  value: string;
  delta?: number | null;
  tone?: 'higher-better' | 'lower-better';
  sub?: string;
}) {
  const hasDelta = delta !== null && delta !== undefined && Number.isFinite(delta);
  // deltaColor removed — severity is now computed inside the StatusDot below (T113)
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
          fontSize: 26,
          fontWeight: 700,
          marginTop: 4,
          color: 'var(--color-text-primary, #111)',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.1,
          letterSpacing: '-0.015em',
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
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        {/* T113 — YoY delta replaced by StatusDot; suppressed when delta === 0 */}
        <StatusDot
          severity={
            !hasDelta
              ? 'info'
              : tone === 'higher-better'
                ? delta! > 0
                  ? 'info'
                  : 'error'
                : tone === 'lower-better'
                  ? delta! < 0
                    ? 'info'
                    : 'error'
                  : 'info'
          }
          title={`${label} YoY`}
          message={
            (delta && delta > 0 ? '▲ ' : delta && delta < 0 ? '▼ ' : '') +
            (formatDelta(delta ?? 0) ?? '—')
          }
          suppressIfZero={delta ?? 0}
        />
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}

function SubHeader({ label, hint }: { label: string; hint: string | null }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
        marginBottom: 10,
        flexWrap: 'wrap',
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: 'var(--color-text-tertiary, #767b84)',
        }}
      >
        {label}
      </h3>
      {hint && (
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary, #767b84)' }}>{hint}</span>
      )}
    </div>
  );
}

function Divider() {
  return (
    <div
      aria-hidden
      style={{
        height: 1,
        background: 'var(--color-border-hairline, #c8c8c5)',
      }}
    />
  );
}

function EmptyLine({ copy }: { copy: string }) {
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
    fontWeight: 700,
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
