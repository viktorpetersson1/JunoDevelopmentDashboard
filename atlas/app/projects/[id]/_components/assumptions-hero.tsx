/**
 * Assumptions & key figures (V6.1 T106).
 *
 * Mirrors the Excel "Assumptions and key figures" block (K6:M31 in the master
 * model) — the at-a-glance summary every reader scans first. 3-column × 4-row
 * KPI grid that lives ABOVE the 9-line P&L on the Summary tab.
 *
 * Pure presentation: every cell pulls from `ProjectInput` or `ProjectKpis`
 * (engine output). No hardcoded numbers. Engine untouched (Hard Rule #2).
 */

import type { CSSProperties } from 'react';
import type { ProjectInput, ProjectResult } from '@/lib/calc/project/types';

interface Cell {
  /** Small uppercase label (10–11px). */
  label: string;
  /** Big value (24–28px bold). */
  value: string;
  /** Optional secondary line under the value (e.g. "5,317 + 2,479"). */
  sub?: string;
}

// ── Formatters ──────────────────────────────────────────────────────────────

function fmtMoney(usd: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return '—';
  const abs = Math.abs(usd);
  if (opts.compact && abs >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (opts.compact && abs >= 1_000) return `$${(usd / 1_000).toFixed(0)}k`;
  return `$${Math.round(usd).toLocaleString()}`;
}

function fmtPct(decimal: number | null | undefined): string {
  if (decimal === null || decimal === undefined || !Number.isFinite(decimal)) return '—';
  return `${(decimal * 100).toFixed(1)}%`;
}

function fmtPsf(usd: number | null | undefined): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd) || usd <= 0) return '—';
  return `$${Math.round(usd).toLocaleString()}`;
}

function fmtSqft(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${n.toLocaleString()} sqft`;
}

function fmtMonth(ym: string | null | undefined): string {
  if (!ym) return '—';
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const parts = ym.split('-');
  const y = parts[0] ?? ym;
  const mIdx = Number(parts[1] ?? 0) - 1;
  return MONTHS[mIdx] ? `${MONTHS[mIdx]} ${y}` : ym;
}

// ── Cell-builder helpers ─────────────────────────────────────────────────────

/** Target $/sqft from explicit override; null when no override is set. */
function targetPsf(project: ProjectInput): number | null {
  return project.sale_price_per_sqft_override ?? null;
}

/** Margin target — fractional decimal (0.20 = 20%). */
function targetMargin(project: ProjectInput): number | null {
  return project.target_margin ?? null;
}

// ── Component ────────────────────────────────────────────────────────────────

export function AssumptionsHero({
  project,
  result,
}: {
  project: ProjectInput;
  result: ProjectResult;
}) {
  const kpis = result.kpis;
  const sqftAg = project.villa_sqft_ag ?? 0;
  const sqftBg = project.villa_sqft_bg ?? 0;
  const sqftTotal = sqftAg + sqftBg;

  const cells: Cell[] = [
    // Row 1 — dates + sqft
    { label: 'Start date', value: fmtMonth(result.start_date ?? project.start_date) },
    { label: 'Sale date', value: fmtMonth(result.sale_date) },
    {
      label: 'Total villa',
      value: fmtSqft(sqftTotal),
      sub: sqftBg > 0 ? `${sqftAg.toLocaleString()} + ${sqftBg.toLocaleString()}` : undefined,
    },

    // Row 2 — $/sqft target vs actual + margin
    { label: '$/sqft target', value: fmtPsf(targetPsf(project)) },
    { label: '$/sqft actual', value: fmtPsf(kpis.sale_price_per_sqft) },
    {
      label: 'Margin (NPAT)',
      value: fmtPct(kpis.profit_margin_pct),
      sub:
        targetMargin(project) !== null
          ? `target ${fmtPct(targetMargin(project))}`
          : undefined,
    },

    // Row 3 — cost stack
    { label: 'Land cost', value: fmtMoney(project.land_cost_usd, { compact: true }) },
    {
      label: 'Construction $/sqft',
      value: fmtPsf(project.build_cost_per_sqft ?? null),
      sub: project.build_cost_per_sqft == null ? 'using global default' : undefined,
    },
    {
      label: 'Superstructure $/sqft',
      value: fmtPsf(project.kingshaus_cost_per_sqft ?? null),
      sub: project.kingshaus_cost_per_sqft == null ? 'using global default' : undefined,
    },

    // Row 4 — financing
    { label: 'Senior LTV', value: fmtPct(project.senior_ltv_pct ?? null) },
    { label: 'Interest rate', value: fmtPct(project.interest_rate_apr ?? null) },
    {
      label: 'Total financing cost',
      value: fmtMoney(kpis.total_interest, { compact: true }),
      sub: `peak debt ${fmtMoney(kpis.peak_debt, { compact: true })}`,
    },
  ];

  const card: CSSProperties = {
    background: 'var(--ja-card-bg)',
    border: 'var(--ja-card-border)',
    borderRadius: 'var(--ja-card-radius)',
    padding: 'var(--ja-card-padding)',
  };

  return (
    <section style={card} aria-labelledby="assumptions-hero-label">
      <h3
        id="assumptions-hero-label"
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-text-tertiary)',
          margin: 0,
          marginBottom: 16,
          fontWeight: 700,
        }}
      >
        Assumptions &amp; key figures
      </h3>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          rowGap: 20,
          columnGap: 32,
        }}
      >
        {cells.map((c) => (
          <div key={c.label} style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--color-text-tertiary)',
              }}
            >
              {c.label}
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 700,
                marginTop: 4,
                color: 'var(--color-text-primary)',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.1,
                letterSpacing: '-0.015em',
              }}
            >
              {c.value}
            </div>
            {c.sub && (
              <div
                style={{
                  fontSize: 11,
                  marginTop: 4,
                  color: 'var(--color-text-tertiary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {c.sub}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
