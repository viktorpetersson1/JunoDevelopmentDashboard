'use client';
/**
 * D-027 — Pipeline velocity presentation components.
 *
 * GoalTracker is now 'use client' so the inline edit form can toggle.
 * All other exports remain pure render; they live in the same file for
 * co-location but don't use any client hooks.
 *
 * Follows the Juno design framework: hairline borders, tabular numerals,
 * near-black accents, no drop shadows.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatMoney } from '@/lib/utils/money';
import type {
  VelocityReport,
  VelocityYearRow,
  InFlightProject,
} from '@/lib/services/pipeline-velocity';

// ────────────────────────────────────────────────────────────────────────────
// Goal tracker
// ────────────────────────────────────────────────────────────────────────────

interface GoalTrackerProps {
  report: VelocityReport;
  isEditor?: boolean;
}

export function GoalTracker({ report, isEditor = false }: GoalTrackerProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [starts, setStarts] = useState(report.goal.startsPerYear);
  const [sells, setSells] = useState(report.goal.sellsPerYear);
  const [planYears, setPlanYears] = useState(report.goal.planYears);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/globals/velocity', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_starts_per_year: starts,
          target_sells_per_year: sells,
          velocity_plan_years: planYears,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Server error ${res.status}`);
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Section header row with optional Edit button */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <SectionHead
          title="Goal tracker"
          hint={`${report.goal.startsPerYear} starts · ${report.goal.sellsPerYear} sells per year · ${report.goal.planYears}-year plan`}
        />
        {isEditor && !editing && (
          <button
            onClick={() => {
              setSaveError(null);
              setEditing(true);
            }}
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--color-text-secondary, #6b7280)',
              background: 'transparent',
              border: '1px solid var(--color-border-hairline, #c8c8c5)',
              borderRadius: 6,
              padding: '4px 10px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Edit goals
          </button>
        )}
      </div>

      {/* Inline edit form — only visible when editing=true */}
      {editing && (
        <div
          style={{
            background: 'var(--color-surface-raised, #fff)',
            border: '1px solid var(--color-border-hairline, #c8c8c5)',
            borderRadius: 'var(--ja-card-radius)',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-tertiary, #767b84)' }}>
                Starts / year
              </span>
              <input
                type="number"
                min={0}
                max={20}
                step={1}
                value={starts}
                onChange={(e) => setStarts(Number(e.target.value))}
                style={{
                  width: 80,
                  fontSize: 15,
                  fontWeight: 700,
                  padding: '6px 8px',
                  border: '1px solid var(--color-border-hairline, #c8c8c5)',
                  borderRadius: 6,
                  background: 'var(--color-surface-sunken, #fafaf8)',
                  color: 'var(--color-text-primary, #111)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-tertiary, #767b84)' }}>
                Sells / year
              </span>
              <input
                type="number"
                min={0}
                max={20}
                step={1}
                value={sells}
                onChange={(e) => setSells(Number(e.target.value))}
                style={{
                  width: 80,
                  fontSize: 15,
                  fontWeight: 700,
                  padding: '6px 8px',
                  border: '1px solid var(--color-border-hairline, #c8c8c5)',
                  borderRadius: 6,
                  background: 'var(--color-surface-sunken, #fafaf8)',
                  color: 'var(--color-text-primary, #111)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-tertiary, #767b84)' }}>
                Plan years (1–10)
              </span>
              <input
                type="number"
                min={1}
                max={10}
                step={1}
                value={planYears}
                onChange={(e) => setPlanYears(Number(e.target.value))}
                style={{
                  width: 80,
                  fontSize: 15,
                  fontWeight: 700,
                  padding: '6px 8px',
                  border: '1px solid var(--color-border-hairline, #c8c8c5)',
                  borderRadius: 6,
                  background: 'var(--color-surface-sunken, #fafaf8)',
                  color: 'var(--color-text-primary, #111)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
            </label>
          </div>

          {saveError && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-negative, #b91c1c)' }}>
              {saveError}
            </p>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--color-surface-base, #fff)',
                background: saving ? 'var(--color-text-tertiary, #767b84)' : 'var(--color-accent-base, #131313)',
                border: 'none',
                borderRadius: 6,
                padding: '7px 16px',
                cursor: saving ? 'default' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setSaveError(null);
                // Reset inputs to current report values
                setStarts(report.goal.startsPerYear);
                setSells(report.goal.sellsPerYear);
                setPlanYears(report.goal.planYears);
              }}
              disabled={saving}
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--color-text-secondary, #6b7280)',
                background: 'transparent',
                border: '1px solid var(--color-border-hairline, #c8c8c5)',
                borderRadius: 6,
                padding: '7px 16px',
                cursor: saving ? 'default' : 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          background: 'var(--color-surface-raised, #fff)',
          border: '1px solid var(--color-border-hairline, #c8c8c5)',
          borderRadius: 'var(--ja-card-radius)',
          overflow: 'hidden',
        }}
      >
        {/* Column header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '64px 1fr 1fr',
            gap: 16,
            padding: '10px 16px',
            borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)',
            background: 'var(--color-surface-sunken, #fafaf8)',
          }}
        >
          <Eyebrow>Year</Eyebrow>
          <Eyebrow>Starts</Eyebrow>
          <Eyebrow>Sells</Eyebrow>
        </div>
        {report.years.map((y) => (
          <YearRow key={y.year} row={y} />
        ))}
      </div>
    </section>
  );
}

function YearRow({ row }: { row: VelocityYearRow }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '64px 1fr 1fr',
        gap: 16,
        padding: '14px 16px',
        borderTop: '1px solid var(--color-border-hairline, #c8c8c5)',
        alignItems: 'center',
        background: row.isCurrent ? 'var(--color-surface-sunken, #fafaf8)' : 'transparent',
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--color-text-primary, #111)',
        }}
      >
        {row.year}
        {row.isCurrent && (
          <span
            style={{
              display: 'block',
              fontSize: 9,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--color-text-tertiary, #767b84)',
            }}
          >
            now
          </span>
        )}
      </div>
      <SegmentBar
        actual={row.startsActual}
        expected={row.startsExpected}
        target={row.startsTarget}
        gap={row.startsGap}
      />
      <SegmentBar
        actual={row.sellsActual}
        expected={row.sellsExpected}
        target={row.sellsTarget}
        gap={row.sellsGap}
      />
    </div>
  );
}

/**
 * Segmented progress bar. Target = N boxes. Filled solid = actual, filled
 * grey = expected, hollow = gap. Overflow (total > target) appends a "+N"
 * chip so we never hide over-performance.
 */
function SegmentBar({
  actual,
  expected,
  target,
  gap,
}: {
  actual: number;
  expected: number;
  target: number;
  gap: number;
}) {
  const total = actual + expected;
  const boxes: Array<'actual' | 'expected' | 'empty'> = [];
  let a = actual;
  let e = expected;
  for (let i = 0; i < target; i++) {
    if (a > 0) {
      boxes.push('actual');
      a--;
    } else if (e > 0) {
      boxes.push('expected');
      e--;
    } else {
      boxes.push('empty');
    }
  }
  const overflow = Math.max(0, total - target);

  const statusLabel =
    total >= target ? 'on plan' : total === 0 ? `${target} needed` : `${gap} to go`;
  const statusColor =
    total >= target
      ? 'var(--color-positive, #15803d)'
      : total === 0
        ? 'var(--color-text-tertiary, #767b84)'
        : 'var(--color-warning, #a16207)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {boxes.map((b, i) => (
          <span
            key={i}
            style={{
              width: 22,
              height: 12,
              borderRadius: 3,
              background:
                b === 'actual'
                  ? 'var(--color-accent-base, #131313)'
                  : b === 'expected'
                    ? 'var(--color-text-quaternary, #b0b5bc)'
                    : 'transparent',
              border:
                b === 'empty'
                  ? '1px solid var(--color-border-hairline, #c8c8c5)'
                  : '1px solid transparent',
            }}
          />
        ))}
        {overflow > 0 && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--color-positive, #15803d)',
              marginLeft: 2,
              alignSelf: 'center',
            }}
          >
            +{overflow}
          </span>
        )}
      </div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--color-text-primary, #111)',
        }}
      >
        {total}/{target}
      </span>
      <span style={{ fontSize: 11, color: statusColor }}>{statusLabel}</span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// In-flight
// ────────────────────────────────────────────────────────────────────────────

export function InFlight({ report }: { report: VelocityReport }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SectionHead
        title="In-flight"
        hint={`${report.inFlight.length} ${report.inFlight.length === 1 ? 'project' : 'projects'} building or selling`}
      />
      {report.inFlight.length === 0 ? (
        <EmptyLine copy="No projects currently in pre-construction, construction, or sales." />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 12,
          }}
        >
          {report.inFlight.map((p) => (
            <InFlightCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </section>
  );
}

const STAGE_LABEL: Record<string, string> = {
  pre_construction: 'Pre-construction',
  construction: 'Construction',
  sales: 'Sales',
};

function InFlightCard({ project }: { project: InFlightProject }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      style={{
        textDecoration: 'none',
        color: 'inherit',
        background: 'var(--color-surface-base, #fff)',
        border: '1px solid var(--color-border-hairline, #c8c8c5)',
        borderRadius: 10,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--color-text-primary, #111)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {project.name}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--color-text-tertiary, #767b84)',
            textTransform: 'capitalize',
          }}
        >
          {STAGE_LABEL[project.stage] ?? project.stage}
          {project.market && project.market !== 'default'
            ? ` · ${project.market.replaceAll('_', ' ')}`
            : ''}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 16,
          fontSize: 11,
          color: 'var(--color-text-secondary, #6b7280)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <Timeline label="Start" year={project.startYear} basis={project.startBasis} />
        <Timeline label="Sell" year={project.sellYear} basis={project.sellBasis} />
      </div>

      <div
        style={{
          marginTop: 2,
          paddingTop: 8,
          borderTop: '1px solid var(--color-border-hairline, #c8c8c5)',
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary, #111)' }}>
          {formatMoney(project.totalSales * 100, { compact: true, precision: 2 })}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: marginColor(project.marginPct),
          }}
        >
          {(project.marginPct * 100).toFixed(1)}%
        </span>
      </div>
    </Link>
  );
}

function Timeline({
  label,
  year,
  basis,
}: {
  label: string;
  year: number | null;
  basis: 'actual' | 'expected' | null;
}) {
  return (
    <span>
      <span style={{ color: 'var(--color-text-tertiary, #767b84)' }}>{label} </span>
      <span style={{ color: 'var(--color-text-primary, #111)', fontWeight: 400 }}>
        {year ?? '—'}
      </span>
      {basis === 'expected' && (
        <span style={{ color: 'var(--color-text-quaternary, #b0b5bc)' }}> est</span>
      )}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Candidate funnel
// ────────────────────────────────────────────────────────────────────────────

export function CandidateFunnel({
  report,
  nextYear,
}: {
  report: VelocityReport;
  nextYear: number;
}) {
  // Forward signal: next year's start target vs what's already lined up
  // (anything with a start year of nextYear).
  const nextYearRow = report.years.find((y) => y.year === nextYear);
  const linedUp = nextYearRow?.startsTotal ?? 0;
  const target = report.goal.startsPerYear;
  const gap = Math.max(0, target - linedUp);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SectionHead title="Candidate funnel" hint={`${report.candidateCount} in sourcing`} />
      <div
        style={{
          background: 'var(--color-surface-raised, #fff)',
          border: '1px solid var(--color-border-hairline, #c8c8c5)',
          borderRadius: 'var(--ja-card-radius)',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {report.funnel.map((stage, i) => (
            <FunnelStep
              key={stage.key}
              label={stage.label}
              count={stage.count}
              isLast={i === report.funnel.length - 1}
            />
          ))}
        </div>

        <div
          style={{
            fontSize: 12,
            color: 'var(--color-text-secondary, #6b7280)',
            lineHeight: 1.5,
            paddingTop: 12,
            borderTop: '1px solid var(--color-border-hairline, #c8c8c5)',
          }}
        >
          {gap > 0 ? (
            <>
              <strong style={{ color: 'var(--color-text-primary, #111)' }}>Forward signal:</strong>{' '}
              {linedUp} of {target} starts lined up for {nextYear}.{' '}
              <strong style={{ color: 'var(--color-warning, #a16207)' }}>Need {gap} more</strong>{' '}
              {gap === 1 ? 'candidate' : 'candidates'} to advance from sourcing to keep the plan on
              track.
            </>
          ) : (
            <>
              <strong style={{ color: 'var(--color-text-primary, #111)' }}>Forward signal:</strong>{' '}
              {nextYear} starts target ({target}) is covered by projects already in the pipeline.
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function FunnelStep({ label, count, isLast }: { label: string; count: number; isLast: boolean }) {
  return (
    <>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          minWidth: 96,
          padding: '10px 12px',
          background: 'var(--color-surface-sunken, #fafaf8)',
          border: '1px solid var(--color-border-hairline, #c8c8c5)',
          borderRadius: 8,
        }}
      >
        <span
          style={{
            fontSize: 22,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--color-text-primary, #111)',
            lineHeight: 1,
          }}
        >
          {count}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-text-tertiary, #767b84)',
            textAlign: 'center',
          }}
        >
          {label}
        </span>
      </div>
      {!isLast && (
        <span
          aria-hidden
          style={{
            color: 'var(--color-text-quaternary, #b0b5bc)',
            fontSize: 14,
          }}
        >
          →
        </span>
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ────────────────────────────────────────────────────────────────────────────

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
      <h2
        style={{
          margin: 0,
          fontSize: 17,
          fontWeight: 700,
          letterSpacing: '-0.015em',
          color: 'var(--color-text-primary, #111)',
        }}
      >
        {title}
      </h2>
      {hint && (
        <span
          style={{
            fontSize: 12,
            color: 'var(--color-text-tertiary, #767b84)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {hint}
        </span>
      )}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--color-text-tertiary, #767b84)',
      }}
    >
      {children}
    </span>
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

function marginColor(m: number): string {
  if (m >= 0.2) return 'var(--color-positive, #15803d)';
  if (m >= 0.1) return 'var(--color-text-primary, #111)';
  if (m >= 0) return 'var(--color-warning, #a16207)';
  return 'var(--color-negative, #b91c1c)';
}
