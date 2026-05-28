'use client';

/**
 * D-026 — Market intelligence client.
 *
 * One unified section that bundles Market Pulse + $/SF by sub-market + Recent
 * closed comps. A single market filter at the top scopes the KPIs and the
 * recent-comps feed; the bar chart always shows the full portfolio so you can
 * compare. Selecting a bar acts as a click-to-filter shortcut.
 *
 * A single Refresh button kicks off the AI market research that populates
 * everything below.
 */

import { useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { CompView } from '@/lib/repos/comps';
import type { MarketSubCut } from '@/lib/db/schema/markets';

interface MarketIntelProps {
  canEdit: boolean;
  windowDays: number;
  closedInWindow: CompView[];
  priorClosedInWindow: CompView[];
  activeAll: CompView[];
  subCuts: MarketSubCut[];
  totalCompsInLibrary: number;
}

interface KpiBucket {
  avgPsf: number | null;
  medianDom: number | null;
  closedCount: number;
  activeCount: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
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
function computeKpis(
  closed: CompView[],
  active: CompView[]
): KpiBucket {
  const psfs = closed.map((c) => c.psf).filter((n): n is number => n != null && n > 0);
  const doms = closed
    .map((c) => c.domDays)
    .filter((n): n is number => n != null && n >= 0);
  return {
    avgPsf: psfs.length > 0 ? Math.round(avg(psfs) ?? 0) : null,
    medianDom: doms.length > 0 ? Math.round(median(doms) ?? 0) : null,
    closedCount: closed.length,
    activeCount: active.length,
  };
}
function pctDelta(curr: number | null, prior: number | null): number | null {
  if (curr === null || prior === null || prior === 0) return null;
  return (curr - prior) / prior;
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

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

const ALL_SUBCUTS = '__all__';

export function MarketIntel({
  canEdit,
  windowDays,
  closedInWindow,
  priorClosedInWindow,
  activeAll,
  subCuts,
  totalCompsInLibrary,
}: MarketIntelProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>(ALL_SUBCUTS);

  // Refresh state
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [refreshTone, setRefreshTone] = useState<'success' | 'error' | null>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshMsg(null);
    setRefreshTone(null);
    try {
      const res = await fetch('/api/pricing/market-research', { method: 'POST' });
      const json = (await res.json()) as
        | {
            data: {
              subCutsResearched: number;
              totalCompsFound: number;
              totalInserted: number;
              totalSkipped: number;
            };
          }
        | { error: { message: string } };
      if (!res.ok || 'error' in json) {
        const msg = 'error' in json ? json.error.message : `HTTP ${res.status}`;
        setRefreshMsg(`Refresh failed: ${msg}`);
        setRefreshTone('error');
        return;
      }
      const { subCutsResearched, totalCompsFound, totalInserted, totalSkipped } =
        json.data;
      setRefreshMsg(
        `Researched ${subCutsResearched} sub-cuts · found ${totalCompsFound} comps · added ${totalInserted} new${totalSkipped > 0 ? ` (${totalSkipped} already in library)` : ''}.`
      );
      setRefreshTone('success');
      router.refresh();
    } catch (e) {
      setRefreshMsg(
        `Refresh failed: ${e instanceof Error ? e.message : 'unknown error'}`
      );
      setRefreshTone('error');
    } finally {
      setRefreshing(false);
    }
  }, [router]);

  // Apply filter to closed + active
  const closedFiltered =
    filter === ALL_SUBCUTS
      ? closedInWindow
      : closedInWindow.filter((c) => c.subCutKey === filter);
  const activeFiltered =
    filter === ALL_SUBCUTS
      ? activeAll
      : activeAll.filter((c) => c.subCutKey === filter);
  const priorFiltered =
    filter === ALL_SUBCUTS
      ? priorClosedInWindow
      : priorClosedInWindow.filter((c) => c.subCutKey === filter);

  // KPIs
  const current = useMemo(
    () => computeKpis(closedFiltered, activeFiltered),
    [closedFiltered, activeFiltered]
  );
  const prior = useMemo(
    () => computeKpis(priorFiltered, []),
    [priorFiltered]
  );
  const deltaPsf = pctDelta(current.avgPsf, prior.avgPsf);
  const deltaDom = pctDelta(current.medianDom, prior.medianDom);
  const deltaClosed = pctDelta(current.closedCount, prior.closedCount);

  // Bar chart data — always portfolio-wide
  const psfBySubCut = useMemo(() => {
    const bySubCut = new Map<string, { psfs: number[]; doms: number[] }>();
    for (const c of closedInWindow) {
      if (!c.psf || c.psf <= 0) continue;
      const bucket = bySubCut.get(c.subCutKey) ?? { psfs: [], doms: [] };
      bucket.psfs.push(c.psf);
      if (c.domDays != null) bucket.doms.push(c.domDays);
      bySubCut.set(c.subCutKey, bucket);
    }
    return Array.from(bySubCut.entries())
      .map(([subCutKey, { psfs }]) => ({
        subCutKey,
        medianPsf: Math.round(median(psfs) ?? 0),
        closedCount: psfs.length,
      }))
      .sort((a, b) => b.medianPsf - a.medianPsf);
  }, [closedInWindow]);

  const maxPsf = Math.max(...psfBySubCut.map((r) => r.medianPsf), 1);

  // Subcut label map
  const labelMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const sc of subCuts) m.set(sc.key, sc.label);
    return m;
  }, [subCuts]);

  // Recent comps (most recent 10 from filtered closed list)
  const recentFeed = closedFiltered.slice(0, 10);

  const filterLabel =
    filter === ALL_SUBCUTS ? 'All sub-markets' : labelMap.get(filter) ?? filter;

  return (
    <div
      style={{
        background: 'var(--color-surface-raised, #fff)',
        border: '1px solid var(--color-border-hairline, #c8c8c5)',
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* Header — title, filter chips, refresh */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-text-primary, #111)',
              }}
            >
              Market intelligence
            </h2>
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--color-text-tertiary, #767b84)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              last {windowDays} days · {totalCompsInLibrary} comps in library
            </span>
          </div>
          {canEdit && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border-hairline, #c8c8c5)',
                  background: refreshing
                    ? 'var(--color-surface-sunken, #fafaf8)'
                    : 'var(--color-surface-base, #fff)',
                  color: 'var(--color-text-primary, #111)',
                  cursor: refreshing ? 'wait' : 'pointer',
                }}
              >
                {refreshing ? 'Researching… (~30s)' : 'Refresh market data'}
              </button>
              {refreshMsg && (
                <span
                  style={{
                    fontSize: 11,
                    color:
                      refreshTone === 'error'
                        ? 'var(--color-negative, #b91c1c)'
                        : 'var(--color-positive, #15803d)',
                  }}
                >
                  {refreshMsg}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <FilterPill
            label="All"
            active={filter === ALL_SUBCUTS}
            onClick={() => setFilter(ALL_SUBCUTS)}
          />
          {subCuts.map((sc) => (
            <FilterPill
              key={sc.key}
              label={sc.label}
              active={filter === sc.key}
              onClick={() => setFilter(sc.key)}
            />
          ))}
        </div>
      </div>

      {/* KPI strip — filtered */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
        }}
      >
        <KpiTile
          label="Avg $/SF"
          value={current.avgPsf !== null ? `$${current.avgPsf.toLocaleString()}` : '—'}
          delta={deltaPsf}
          tone="higher-better"
          sub={current.avgPsf === null ? 'no closed comps' : 'closed in window'}
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

      {/* Divider */}
      <Divider />

      {/* $/SF by sub-market — bar chart (always portfolio-wide; selected bar highlighted; click to filter) */}
      <div>
        <SubSectionHeader
          label="$/SF by sub-market"
          hint={
            filter !== ALL_SUBCUTS
              ? `viewing ${filterLabel} — click bars to switch`
              : 'click a bar to filter the page'
          }
        />
        {psfBySubCut.length === 0 ? (
          <EmptyLine copy="No closed comps in window — bar chart will populate once you refresh market data." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {psfBySubCut.map((r) => {
              const label = labelMap.get(r.subCutKey) ?? r.subCutKey;
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
                      fontWeight: 600,
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

      {/* Divider */}
      <Divider />

      {/* Recent comps — filtered */}
      <div>
        <SubSectionHeader
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
                ? 'No closed comps in window yet. Refresh market data to populate.'
                : `No closed comps in ${filterLabel} in window.`
            }
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)',
                  }}
                >
                  {['Date', 'Address', 'Sub-market', 'SF', 'Price', '$/SF'].map(
                    (h, i) => (
                      <th key={h} style={thStyle(i >= 3 ? 'right' : 'left')}>
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {recentFeed.map((c) => (
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
                    <td style={tdStyle('left', { tertiary: true })}>
                      {labelMap.get(c.subCutKey) ?? c.subCutKey}
                    </td>
                    <td style={tdStyle('right', { tabular: true })}>
                      {c.agSqft.toLocaleString()}
                    </td>
                    <td style={tdStyle('right', { tabular: true })}>
                      {c.salePriceCents !== null
                        ? formatUsd(c.salePriceCents / 100, true)
                        : '—'}
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
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Small UI primitives
// ────────────────────────────────────────────────────────────────────────────

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 11,
        fontWeight: 500,
        padding: '4px 10px',
        borderRadius: 999,
        border: active
          ? '1px solid var(--color-accent-base, #131313)'
          : '1px solid var(--color-border-hairline, #c8c8c5)',
        background: active
          ? 'var(--color-accent-base, #131313)'
          : 'var(--color-surface-base, #fff)',
        color: active ? '#fff' : 'var(--color-text-primary, #111)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

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
  let deltaColor = 'var(--color-text-tertiary, #767b84)';
  if (hasDelta && tone) {
    const positive = delta! > 0;
    const good =
      (tone === 'higher-better' && positive) ||
      (tone === 'lower-better' && !positive);
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
            {delta! > 0 ? '▲' : delta! < 0 ? '▼' : '·'} {formatDelta(delta!)}
          </span>
        )}
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}

function SubSectionHeader({ label, hint }: { label: string; hint?: string }) {
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
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-tertiary, #767b84)',
        }}
      >
        {label}
      </h3>
      {hint && (
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary, #767b84)' }}>
          {hint}
        </span>
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
