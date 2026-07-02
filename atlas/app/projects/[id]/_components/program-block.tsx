/**
 * V7 T136 — exec block 1: Program.
 *
 * Horizontal phase bar (sourcing → permitting → construction → sales) with
 * key dates, % elapsed, and slippage vs the locked plan. Server-renderable;
 * the phase-bar markup is the existing Timeline-tab pattern.
 *
 * Slippage = current engine sale date vs the sale date computed from the
 * latest LOCKED approval snapshot's inputs (same globals + scenario — no
 * separate math). Amber ≥ 1 month, red ≥ 3 (per the V7 doc). No locked
 * snapshot → explicit "No locked plan" (Rule 6: empty ≠ zero).
 */

import type { ProjectInput, ProjectResult } from '@/lib/calc/project/types';

const PHASE_COLORS: Record<string, string> = {
  sourcing: 'var(--color-text-quaternary)',
  permitting: 'var(--color-info)',
  construction: 'var(--color-accent-lime)',
  sales: 'var(--color-positive)',
};

/** Whole-month difference between two YYYY-MM strings (b − a). */
export function monthsBetweenYM(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (Number(by) - Number(ay)) * 12 + (Number(bm) - Number(am));
}

export function ProgramBlock({
  project,
  result,
  plannedSaleDate,
  todayYM,
}: {
  project: ProjectInput;
  result: ProjectResult;
  /** Sale date from the locked snapshot's inputs run through the SAME engine
   *  + globals. Null = no locked plan yet. */
  plannedSaleDate: string | null;
  todayYM: string;
}) {
  const phases = [
    { id: 'sourcing', label: 'Sourcing', months: project.sourcing_months ?? 0 },
    {
      id: 'permitting',
      label: 'Permitting',
      months: project.permitting_preconstruction_months ?? 0,
    },
    { id: 'construction', label: 'Construction', months: project.construction_months ?? 0 },
    { id: 'sales', label: 'Sales', months: project.sales_months ?? 0 },
  ].filter((p) => p.months > 0);
  const totalMonths = phases.reduce((s, p) => s + p.months, 0);

  // % elapsed — from program start to today, clamped to [0, 100].
  const start = result.start_date;
  const elapsedMonths = start ? Math.max(0, monthsBetweenYM(start, todayYM)) : 0;
  const elapsedPct =
    start && totalMonths > 0 ? Math.min(100, Math.round((elapsedMonths / totalMonths) * 100)) : 0;

  // Slippage vs the locked plan (months; + = later than plan).
  const slippage =
    plannedSaleDate && result.sale_date ? monthsBetweenYM(plannedSaleDate, result.sale_date) : null;
  const slipTone: 'ok' | 'amber' | 'red' | 'none' =
    slippage === null ? 'none' : slippage >= 3 ? 'red' : slippage >= 1 ? 'amber' : 'ok';
  const slipColor =
    slipTone === 'red'
      ? 'var(--color-negative, #b91c1c)'
      : slipTone === 'amber'
        ? 'var(--color-warning, #a16207)'
        : 'var(--color-text-primary)';

  return (
    <div>
      {/* Key figures row */}
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 16 }}>
        <Fig label="Program" value={`${totalMonths} mo`} />
        <Fig label="Start" value={result.start_date ?? '—'} />
        <Fig label="Target sale" value={result.sale_date ?? '—'} />
        <Fig label="Elapsed" value={start ? `${elapsedPct}%` : '—'} />
        <Fig
          label="Slippage vs plan"
          value={
            slippage === null
              ? 'No locked plan'
              : slippage === 0
                ? 'On plan'
                : `${slippage > 0 ? '+' : ''}${slippage} mo`
          }
          color={slipColor}
          small={slippage === null}
        />
      </div>

      {/* Phase bar */}
      <div
        role="img"
        aria-label="Project phase timeline"
        style={{
          position: 'relative',
          display: 'flex',
          width: '100%',
          height: 32,
          borderRadius: 6,
          overflow: 'hidden',
          border: 'var(--ja-card-border)',
        }}
      >
        {phases.map((p) => (
          <div
            key={p.id}
            title={`${p.label} — ${p.months} months`}
            style={{
              flex: p.months,
              background: PHASE_COLORS[p.id],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              color:
                p.id === 'construction' ? 'var(--color-text-on-lime)' : 'var(--color-text-inverse)',
            }}
          >
            {p.months >= 2 ? `${p.label} · ${p.months}mo` : ''}
          </div>
        ))}
        {/* Today marker */}
        {start && elapsedPct > 0 && elapsedPct < 100 && (
          <div
            title={`Today — ${elapsedPct}% elapsed`}
            style={{
              position: 'absolute',
              left: `${elapsedPct}%`,
              top: 0,
              bottom: 0,
              width: 2,
              background: 'var(--color-text-primary)',
            }}
          />
        )}
      </div>
    </div>
  );
}

function Fig({
  label,
  value,
  color,
  small,
}: {
  label: string;
  value: string;
  color?: string;
  small?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-tertiary)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: small ? 13 : 18,
          fontWeight: 700,
          marginTop: 2,
          fontVariantNumeric: 'tabular-nums',
          color: color ?? 'var(--color-text-primary)',
          lineHeight: small ? '24px' : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}
