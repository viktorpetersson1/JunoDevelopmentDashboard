'use client';

/**
 * QuickPriceClient — the interactive "Price a Property" form and inline
 * results panel for the /pricing/new route.
 *
 * UX flow:
 *   1. User pastes a Google Maps URL OR types an address.
 *   2. "Look up" → POST /api/pricing/parse-url → fills address + sub-cut hint.
 *   3. User fills in property specs (SF, lot, year built, NC toggle).
 *   4. "Run Pricing Analysis" → POST /api/pricing/research (~15–20 s).
 *   5. Results rendered inline: comp table, exit corridor, cost stack, margin
 *      model, probability weighting.
 *   6. "Save comps to library" → batch POST /api/comps for each comp.
 */

import { useState, useCallback } from 'react';
import type { MarketSubCut } from '@/lib/db/schema/markets';
import type { PricingAnalysis } from '@/app/api/pricing/research/route';
import type { CompResearchOutput, ResearchedComp } from '@/lib/pricing/comp-researcher';
import { WATERFRONT_OPTIONS, type WaterfrontType } from '@/lib/pricing/location-factors';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface ResearchResult {
  address: string;
  subCutLabel: string;
  agSqft: number;
  isNc: boolean;
  research: CompResearchOutput;
  analysis: PricingAnalysis;
}

interface ParseResult {
  address: string;
  lat: number | null;
  lng: number | null;
  inferredSubCutKey: string | null;
  city: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Format helpers
// ────────────────────────────────────────────────────────────────────────────

function usd(n: number | null, decimals = 0): string {
  if (n === null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n);
}

function pct(n: number | null): string {
  if (n === null) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function psf(n: number | null): string {
  if (n === null) return '—';
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}/SF`;
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function SectionHeader({ label, badge }: { label: string; badge?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <h2
        style={{
          margin: 0,
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--color-text-primary)',
        }}
      >
        {label}
      </h2>
      {badge && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 7px',
            borderRadius: 20,
            background: 'var(--color-surface-base)',
            border: '1px solid var(--color-border-hairline)',
            color: 'var(--color-text-tertiary)',
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

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 14,
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-tertiary)',
          fontWeight: 600,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: highlight ? 20 : 16,
          fontWeight: 600,
          color: highlight ? 'var(--color-text-primary)' : 'var(--color-text-primary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function ConfidenceBadge({ level }: { level: 'high' | 'medium' | 'low' }) {
  const colors = {
    high: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
    medium: { bg: '#fef9c3', text: '#713f12', border: '#fde047' },
    low: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  };
  const c = colors[level];
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 20,
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {level} confidence
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Comp Table
// ────────────────────────────────────────────────────────────────────────────

function CompTable({ comps }: { comps: ResearchedComp[] }) {
  if (comps.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>
        No comps returned by the researcher.
      </p>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 12,
        }}
      >
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
            {[
              'Address',
              'Status',
              'Closed / Listed',
              'SF',
              'Sale Price',
              '$/SF',
              'NC?',
              'Source',
              'Confidence',
            ].map((h) => (
              <th
                key={h}
                style={{
                  padding: '6px 10px',
                  textAlign: 'left',
                  fontWeight: 600,
                  color: 'var(--color-text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  fontSize: 10,
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comps.map((c, i) => (
            <tr
              key={i}
              style={{
                borderBottom: '1px solid var(--color-border-hairline)',
                background: i % 2 === 0 ? 'transparent' : 'var(--color-surface-base)',
              }}
            >
              <td style={{ padding: '8px 10px', color: 'var(--color-text-primary)' }}>
                {c.sourceUrl ? (
                  <a
                    href={c.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--color-accent-base)', textDecoration: 'none' }}
                  >
                    {c.address}
                  </a>
                ) : (
                  c.address
                )}
              </td>
              <td style={{ padding: '8px 10px' }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    padding: '2px 6px',
                    borderRadius: 4,
                    background:
                      c.status === 'closed'
                        ? 'var(--color-surface-base)'
                        : '#dbeafe',
                    color:
                      c.status === 'closed'
                        ? 'var(--color-text-secondary)'
                        : '#1d4ed8',
                    border: '1px solid var(--color-border-hairline)',
                  }}
                >
                  {c.status}
                </span>
              </td>
              <td
                style={{
                  padding: '8px 10px',
                  color: 'var(--color-text-secondary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {c.closingDate ?? '—'}
              </td>
              <td
                style={{
                  padding: '8px 10px',
                  color: 'var(--color-text-secondary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {c.agSqft.toLocaleString()}
              </td>
              <td
                style={{
                  padding: '8px 10px',
                  color: 'var(--color-text-primary)',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 500,
                }}
              >
                {usd(c.salePriceUsd)}
              </td>
              <td
                style={{
                  padding: '8px 10px',
                  color: 'var(--color-text-primary)',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 600,
                }}
              >
                {psf(c.psf)}
              </td>
              <td
                style={{
                  padding: '8px 10px',
                  color: 'var(--color-text-secondary)',
                  textAlign: 'center',
                }}
              >
                {c.isNewConstruction ? '✓' : '—'}
              </td>
              <td style={{ padding: '8px 10px', color: 'var(--color-text-tertiary)' }}>
                {c.sourceName}
              </td>
              <td style={{ padding: '8px 10px' }}>
                <span
                  style={{
                    fontSize: 10,
                    padding: '1px 6px',
                    borderRadius: 4,
                    background:
                      c.confidence === 'confirmed' ? '#d1fae5' : '#fef9c3',
                    color: c.confidence === 'confirmed' ? '#065f46' : '#713f12',
                    fontWeight: 600,
                  }}
                >
                  {c.confidence}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Results panel — 5 stages
// ────────────────────────────────────────────────────────────────────────────

function ResultsPanel({
  result,
  onSaveComps,
  savingComps,
  compsSaved,
}: {
  result: ResearchResult;
  onSaveComps: () => void;
  savingComps: boolean;
  compsSaved: boolean;
}) {
  const { research, analysis } = result;
  const { costStack, exitCorridor, marginModel, probabilityWeighting } = analysis;

  const hasRevenue = exitCorridor.baseRevenue !== null;
  const hasMargin = marginModel.baseMarginPct !== null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header / property summary */}
      <div
        style={{
          padding: '16px 20px',
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border-hairline)',
          borderRadius: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
              Pricing analysis for
            </p>
            <h2
              style={{
                margin: '2px 0 0',
                fontSize: 18,
                fontWeight: 600,
                color: 'var(--color-text-primary)',
              }}
            >
              {result.address}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-secondary)' }}>
              {result.subCutLabel} · {result.agSqft.toLocaleString()} SF ·{' '}
              {result.isNc ? 'New Construction' : 'Resale'}
            </p>
          </div>
          <ConfidenceBadge level={research.confidence} />
        </div>

        {research.usedWebSearch ? (
          <p
            style={{
              margin: 0,
              fontSize: 11,
              color: '#065f46',
              background: '#d1fae5',
              border: '1px solid #6ee7b7',
              borderRadius: 6,
              padding: '4px 10px',
              display: 'inline-block',
            }}
          >
            ✓ Live comp data — searched {research.sourcesSearched.join(', ')}
          </p>
        ) : (
          <p
            style={{
              margin: 0,
              fontSize: 11,
              color: '#713f12',
              background: '#fef9c3',
              border: '1px solid #fde047',
              borderRadius: 6,
              padding: '4px 10px',
              display: 'inline-block',
            }}
          >
            ⚠ AI-estimated comps — verify with live MLS before committing to any price
          </p>
        )}
      </div>

      {/* Stage 2: Comp Evidence */}
      <Card>
        <SectionHeader label="Stage 2 — Comp Evidence" badge={`${research.comps.length} comps`} />
        {research.dataGap && (
          <div
            style={{
              fontSize: 12,
              padding: '8px 12px',
              background: '#fee2e2',
              border: '1px solid #fca5a5',
              borderRadius: 8,
              color: '#991b1b',
              marginBottom: 12,
            }}
          >
            ⚠ Data gap: fewer than 3 closed comps found. Estimates less reliable.
          </div>
        )}
        {research.narrativeSummary && (
          <p
            style={{
              margin: '0 0 12px',
              fontSize: 12,
              color: 'var(--color-text-secondary)',
              lineHeight: 1.6,
            }}
          >
            {research.narrativeSummary}
          </p>
        )}
        <CompTable comps={research.comps} />
        {research.comps.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {compsSaved ? (
              <span style={{ fontSize: 12, color: '#065f46' }}>
                ✓ Comps saved to library
              </span>
            ) : (
              <button
                onClick={onSaveComps}
                disabled={savingComps}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border-hairline)',
                  background: 'var(--color-surface-base)',
                  color: 'var(--color-text-primary)',
                  cursor: savingComps ? 'wait' : 'pointer',
                }}
              >
                {savingComps ? 'Saving…' : 'Save comps to library'}
              </button>
            )}
          </div>
        )}
      </Card>

      {/* Stages 1 + 3 side by side */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        {/* Stage 1: Cost Stack */}
        <Card>
          <SectionHeader label="Stage 1 — Cost Stack" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Metric
              label="Build cost / SF"
              value={`$${costStack.buildCostPerSqft}/SF`}
              sub="from BASELINE_GLOBALS"
            />
            <Metric
              label="Total build cost"
              value={usd(costStack.totalBuildCost)}
              sub={`${result.agSqft.toLocaleString()} SF × $${costStack.buildCostPerSqft}`}
            />
            <Metric
              label="Land cost"
              value={costStack.landCostUsd !== null ? usd(costStack.landCostUsd) : 'Not provided'}
              sub={costStack.landCostUsd === null ? 'Re-run with land cost for full margin' : undefined}
            />
            <div style={{ borderTop: '1px solid var(--color-border-hairline)', paddingTop: 12 }}>
              <Metric
                label="Total cost basis"
                value={usd(costStack.totalCostBasis)}
                highlight
              />
            </div>
          </div>
        </Card>

        {/* Stage 3: Exit Corridor */}
        <Card>
          <SectionHeader label="Stage 3 — Exit Corridor" />
          {!hasRevenue ? (
            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0 }}>
              Not enough closed comps to derive an exit corridor.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 8,
                  textAlign: 'center',
                }}
              >
                {[
                  { label: 'Low (P10)', psfVal: exitCorridor.lowPsf, rev: exitCorridor.lowRevenue },
                  { label: 'Base (P50)', psfVal: exitCorridor.basePsf, rev: exitCorridor.baseRevenue },
                  { label: 'High (P90)', psfVal: exitCorridor.highPsf, rev: exitCorridor.highRevenue },
                ].map(({ label, psfVal, rev }) => (
                  <div
                    key={label}
                    style={{
                      padding: '10px 8px',
                      borderRadius: 8,
                      background: 'var(--color-surface-base)',
                      border: '1px solid var(--color-border-hairline)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: 'var(--color-text-tertiary)',
                        textTransform: 'uppercase',
                        marginBottom: 4,
                      }}
                    >
                      {label}
                    </div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: 'var(--color-text-primary)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {psf(psfVal)}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--color-text-secondary)',
                        fontVariantNumeric: 'tabular-nums',
                        marginTop: 2,
                      }}
                    >
                      {usd(rev)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Stages 4 + 5 side by side */}
      {hasRevenue && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {/* Stage 4: Margin Model */}
          <Card>
            <SectionHeader label="Stage 4 — Margin Model" />
            {!hasMargin ? (
              <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0 }}>
                Provide land cost to see margin estimates.
              </p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
                    {['Scenario', 'Revenue', 'Profit', 'Margin'].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '4px 8px',
                          textAlign: 'left',
                          fontSize: 10,
                          fontWeight: 600,
                          color: 'var(--color-text-tertiary)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      label: 'Low',
                      rev: exitCorridor.lowRevenue,
                      profit: marginModel.lowProfit,
                      margin: marginModel.lowMarginPct,
                    },
                    {
                      label: 'Base',
                      rev: exitCorridor.baseRevenue,
                      profit: marginModel.baseProfit,
                      margin: marginModel.baseMarginPct,
                    },
                    {
                      label: 'High',
                      rev: exitCorridor.highRevenue,
                      profit: marginModel.highProfit,
                      margin: marginModel.highMarginPct,
                    },
                  ].map((row) => (
                    <tr
                      key={row.label}
                      style={{ borderBottom: '1px solid var(--color-border-hairline)' }}
                    >
                      <td
                        style={{
                          padding: '8px',
                          fontWeight: 600,
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        {row.label}
                      </td>
                      <td
                        style={{
                          padding: '8px',
                          fontVariantNumeric: 'tabular-nums',
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {usd(row.rev)}
                      </td>
                      <td
                        style={{
                          padding: '8px',
                          fontVariantNumeric: 'tabular-nums',
                          color:
                            row.profit !== null && row.profit < 0 ? '#ef4444' : 'var(--color-text-primary)',
                        }}
                      >
                        {usd(row.profit)}
                      </td>
                      <td
                        style={{
                          padding: '8px',
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: 600,
                          color:
                            row.margin !== null
                              ? row.margin < 0.1
                                ? '#ef4444'
                                : row.margin < 0.2
                                ? '#f59e0b'
                                : '#059669'
                              : 'var(--color-text-tertiary)',
                        }}
                      >
                        {pct(row.margin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* Stage 5: Probability Weighting */}
          <Card>
            <SectionHeader label="Stage 5 — Probability-Weighted Outcome" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  fontSize: 11,
                  color: 'var(--color-text-tertiary)',
                }}
              >
                <span>
                  Low {(probabilityWeighting.lowWeight * 100).toFixed(0)}%
                </span>
                <span>·</span>
                <span>
                  Base {(probabilityWeighting.baseWeight * 100).toFixed(0)}%
                </span>
                <span>·</span>
                <span>
                  High {(probabilityWeighting.highWeight * 100).toFixed(0)}%
                </span>
              </div>

              <Metric
                label="Expected revenue"
                value={usd(probabilityWeighting.weightedRevenue)}
                highlight
              />
              {probabilityWeighting.weightedProfit !== null && (
                <Metric
                  label="Expected profit"
                  value={usd(probabilityWeighting.weightedProfit)}
                  sub={hasMargin ? pct(probabilityWeighting.weightedMarginPct) + ' margin' : undefined}
                />
              )}

              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  color: 'var(--color-text-tertiary)',
                  lineHeight: 1.5,
                }}
              >
                Weighted using a 20/60/20 conservative distribution across the
                Low / Base / High exit corridors derived from comp PSF percentiles.
              </p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────

export function QuickPriceClient({
  subCuts,
  canEdit,
}: {
  subCuts: MarketSubCut[];
  canEdit: boolean;
}) {
  // ── Form state ─────────────────────────────────────────────────────────
  const [mapsInput, setMapsInput] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [subCutKey, setSubCutKey] = useState(subCuts[0]?.key ?? '');
  const [waterfrontType, setWaterfrontType] = useState<string>('');
  const [agSqft, setAgSqft] = useState('');
  const [lotSizeAcres, setLotSizeAcres] = useState('');
  const [yearBuilt, setYearBuilt] = useState('');
  const [isNc, setIsNc] = useState(false);
  const [landCostUsd, setLandCostUsd] = useState('');

  // ── Loading states ─────────────────────────────────────────────────────
  const [parsingUrl, setParsingUrl] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [result, setResult] = useState<ResearchResult | null>(null);

  // ── Save-comps state ───────────────────────────────────────────────────
  const [savingComps, setSavingComps] = useState(false);
  const [compsSaved, setCompsSaved] = useState(false);

  // ── URL parse ──────────────────────────────────────────────────────────
  const handleLookup = useCallback(async () => {
    if (!mapsInput.trim()) return;
    setParsingUrl(true);
    setParseError(null);
    try {
      const res = await fetch('/api/pricing/parse-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: mapsInput }),
      });
      const json = (await res.json()) as {
        data?: ParseResult;
        error?: { message: string };
      };
      if (!res.ok || json.error) {
        setParseError(json.error?.message ?? 'Could not parse URL');
        return;
      }
      const d = json.data!;
      setAddress(d.address ?? mapsInput);
      if (d.lat !== null) setLat(d.lat);
      if (d.lng !== null) setLng(d.lng);
      if (d.inferredSubCutKey) {
        const found = subCuts.find((s) => s.key === d.inferredSubCutKey);
        if (found) setSubCutKey(found.key);
      }
    } catch {
      setParseError('Network error — check your connection');
    } finally {
      setParsingUrl(false);
    }
  }, [mapsInput, subCuts]);

  // ── Research ───────────────────────────────────────────────────────────
  const handleResearch = useCallback(async () => {
    if (!address.trim() || !agSqft.trim()) return;
    const selectedSubCut = subCuts.find((s) => s.key === subCutKey);
    if (!selectedSubCut) return;

    setResearching(true);
    setResearchError(null);
    setResult(null);
    setCompsSaved(false);

    try {
      const body = {
        address: address.trim(),
        lat,
        lng,
        subCutKey,
        subCutLabel: selectedSubCut.label,
        agSqft: parseInt(agSqft, 10),
        lotSizeAcres: lotSizeAcres ? parseFloat(lotSizeAcres) : null,
        yearBuilt: yearBuilt ? parseInt(yearBuilt, 10) : null,
        waterfrontType: waterfrontType ? (waterfrontType as WaterfrontType) : null,
        isNc,
        landCostUsd: landCostUsd ? parseFloat(landCostUsd) : null,
      };

      const res = await fetch('/api/pricing/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        data?: ResearchResult;
        error?: { message: string };
      };
      if (!res.ok || json.error) {
        setResearchError(json.error?.message ?? 'Research failed');
        return;
      }
      setResult(json.data!);
    } catch {
      setResearchError('Network error — please try again');
    } finally {
      setResearching(false);
    }
  }, [address, lat, lng, subCutKey, subCuts, agSqft, lotSizeAcres, yearBuilt, waterfrontType, isNc, landCostUsd]);

  // ── Save comps ─────────────────────────────────────────────────────────
  const handleSaveComps = useCallback(async () => {
    if (!result || savingComps) return;
    setSavingComps(true);
    let saved = 0;
    for (const comp of result.research.comps) {
      try {
        await fetch('/api/comps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: comp.address,
            subCutKey,
            waterfrontType: comp.waterfrontType,
            isNc: comp.isNewConstruction,
            status: comp.status,
            closingDate: comp.closingDate,
            salePriceCents: Math.round(comp.salePriceUsd * 100),
            agSqft: comp.agSqft,
            lotSizeAcres: comp.lotSizeAcres,
            yearBuilt: comp.yearBuilt,
            sourceUrl: comp.sourceUrl,
            source: 'other',
            notes: `AI-researched via Quick Price. Source: ${comp.sourceName}. Confidence: ${comp.confidence}.${comp.notes ? ' ' + comp.notes : ''}`,
          }),
        });
        saved++;
      } catch {
        // Skip duplicates / errors silently — duplicates are expected
      }
    }
    setSavingComps(false);
    if (saved > 0) setCompsSaved(true);
  }, [result, savingComps, subCutKey]);

  const isFormValid =
    address.trim().length > 0 &&
    agSqft.trim().length > 0 &&
    !isNaN(parseInt(agSqft, 10)) &&
    parseInt(agSqft, 10) > 0 &&
    subCutKey.length > 0;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1100 }}>
      {/* Page header */}
      <header>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a
            href="/pricing"
            style={{
              fontSize: 12,
              color: 'var(--color-text-tertiary)',
              textDecoration: 'none',
            }}
          >
            ← Pricing
          </a>
        </div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            margin: '8px 0 4px',
            color: 'var(--color-text-primary)',
          }}
        >
          Price a Property
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: 'var(--color-text-secondary)',
          }}
        >
          Paste a Google Maps link or type an address — the model researches comps
          and runs the 5-stage exit pricing framework.
        </p>
      </header>

      {/* Form */}
      <div
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border-hairline)',
          borderRadius: 14,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* Maps URL lookup */}
        <div>
          <label
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--color-text-secondary)',
              display: 'block',
              marginBottom: 6,
            }}
          >
            Google Maps URL or address
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Paste Google Maps link or type an address…"
              value={mapsInput}
              onChange={(e) => setMapsInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              style={{
                flex: 1,
                fontSize: 13,
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid var(--color-border-hairline)',
                background: 'var(--color-surface-base)',
                color: 'var(--color-text-primary)',
                outline: 'none',
              }}
            />
            <button
              onClick={handleLookup}
              disabled={parsingUrl || !mapsInput.trim()}
              style={{
                fontSize: 13,
                fontWeight: 500,
                padding: '9px 16px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--color-accent-base, #131313)',
                color: '#fff',
                cursor: parsingUrl || !mapsInput.trim() ? 'not-allowed' : 'pointer',
                opacity: parsingUrl || !mapsInput.trim() ? 0.6 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {parsingUrl ? 'Looking up…' : 'Look up →'}
            </button>
          </div>
          {parseError && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#ef4444' }}>{parseError}</p>
          )}
        </div>

        {/* Two-column property specs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
          }}
        >
          {/* Address (populated by lookup, editable) */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>
              Street address <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="123 Ocean View Rd, East Hampton, NY 11937"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Sub-cut */}
          <div>
            <label style={labelStyle}>
              Sub-market <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              value={subCutKey}
              onChange={(e) => setSubCutKey(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {subCuts.map((sc) => (
                <option key={sc.key} value={sc.key}>
                  {sc.label}
                </option>
              ))}
              {subCuts.length === 0 && (
                <option value="">No sub-cuts configured</option>
              )}
            </select>
          </div>

          {/* Waterfront — dominant PSF driver; steers comp matching */}
          <div>
            <label style={labelStyle}>Waterfront</label>
            <select
              value={waterfrontType}
              onChange={(e) => setWaterfrontType(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {WATERFRONT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* SF */}
          <div>
            <label style={labelStyle}>
              Above-grade SF <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="number"
              placeholder="5000"
              value={agSqft}
              onChange={(e) => setAgSqft(e.target.value)}
              min={100}
              max={50000}
              style={inputStyle}
            />
          </div>

          {/* Lot size */}
          <div>
            <label style={labelStyle}>Lot size (acres)</label>
            <input
              type="number"
              placeholder="1.0"
              value={lotSizeAcres}
              onChange={(e) => setLotSizeAcres(e.target.value)}
              min={0}
              step={0.01}
              style={inputStyle}
            />
          </div>

          {/* Year built */}
          <div>
            <label style={labelStyle}>Year built</label>
            <input
              type="number"
              placeholder="2023"
              value={yearBuilt}
              onChange={(e) => setYearBuilt(e.target.value)}
              min={1800}
              max={2100}
              style={inputStyle}
            />
          </div>

          {/* Land cost */}
          <div>
            <label style={labelStyle}>Land cost (USD, optional)</label>
            <input
              type="number"
              placeholder="2500000"
              value={landCostUsd}
              onChange={(e) => setLandCostUsd(e.target.value)}
              min={0}
              style={inputStyle}
            />
          </div>

          {/* NC toggle */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <label style={labelStyle}>Construction type</label>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', height: 38 }}>
              {[
                { value: false, label: 'Resale' },
                { value: true, label: 'New Construction' },
              ].map(({ value, label }) => (
                <label
                  key={label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    color: 'var(--color-text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="isNc"
                    checked={isNc === value}
                    onChange={() => setIsNc(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Run button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={handleResearch}
            disabled={!isFormValid || researching || !canEdit}
            style={{
              fontSize: 14,
              fontWeight: 600,
              padding: '11px 24px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--color-accent-base, #131313)',
              color: '#fff',
              cursor: !isFormValid || researching || !canEdit ? 'not-allowed' : 'pointer',
              opacity: !isFormValid || researching || !canEdit ? 0.5 : 1,
            }}
          >
            {researching ? 'Researching comps…' : 'Run Pricing Analysis →'}
          </button>
          {researching && (
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              Searching Zillow, Realtor.com, Out East, Compass — this takes 15–25 seconds
            </span>
          )}
          {!canEdit && (
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              Editor or admin role required to run pricing analysis
            </span>
          )}
        </div>

        {researchError && (
          <div
            style={{
              fontSize: 13,
              padding: '10px 14px',
              background: '#fee2e2',
              border: '1px solid #fca5a5',
              borderRadius: 8,
              color: '#991b1b',
            }}
          >
            {researchError}
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <ResultsPanel
          result={result}
          onSaveComps={handleSaveComps}
          savingComps={savingComps}
          compsSaved={compsSaved}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Shared inline styles
// ────────────────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  display: 'block',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 13,
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid var(--color-border-hairline)',
  background: 'var(--color-surface-base)',
  color: 'var(--color-text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
};
