'use client';

/**
 * V6.2 T124 — Scenario Modeler client island.
 *
 * 5 driver sliders. On any change (debounced) the page recomputes the
 * strategic answers LOCALLY by calling the same pure functions the server
 * surfaces use — runProject → buildCashSchedule → {capital call, LOC headroom,
 * start capacity, self-funding} + computeRolloutTrigger. No server round-trip,
 * so the sliders give instant feedback and the numbers reconcile with the
 * dedicated pages by construction (same pure functions, same inputs).
 *
 * Distribution forecast (the 6th answer) is deferred to T125 (blocked on VB-3
 * owner↔account links per Viktor) — shown as a "Pending" row, never faked.
 *
 * Save persists the slider values to atlas.scenarios via the existing
 * POST/PATCH /api/scenarios endpoints (+ the T124 starts_per_year_override
 * column); "Make active" flips the active-scenario cookie via
 * POST /api/scenarios/active.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProjectInput, Globals, Scenario } from '@/lib/calc/project/types';
import type { CapitalSourceView, AssignmentView } from '@/lib/repos/capital-sources';
import type { CapTableEntryView } from '@/lib/repos/settings';
import type { ScenarioView } from '@/lib/repos/scenarios';
import { runProject } from '@/lib/calc/project/runProject';
import { buildCashSchedule } from '@/lib/treasury/portfolio-cash-schedule';
import { solveStartCapacity } from '@/lib/treasury/start-capacity';
import { buildSelfFundingTrajectory } from '@/lib/treasury/self-funding';
import { buildDistributionForecast } from '@/lib/treasury/distribution-forecast';
import { computeRolloutTrigger } from '@/lib/finance/rollout-trigger';
import { buildProjectPnL } from '@/lib/finance/project-pnl';

interface ModelerProject {
  uuid: string;
  input: ProjectInput;
  taxRatePct: number | null;
}

interface Props {
  projects: ModelerProject[];
  globals: Globals;
  sources: CapitalSourceView[];
  assignments: AssignmentView[];
  capTable: CapTableEntryView[];
  todayYM: string;
  baseScenario: Scenario;
  rolloutTarget: number | null;
  rolloutOverhead: number;
  rolloutTimeToNpat: number;
  targetStartsPerYear: number;
  canEdit: boolean;
}

interface SliderState {
  salePriceMultiplier: number;
  buildCostMultiplier: number;
  interestRateDeltaBps: number;
  timingShiftMonths: number;
  startsPerYear: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtYM(ym: string | null): string {
  if (!ym) return '—';
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m ?? 1) - 1] ?? ''} ${y ?? ''}`;
}
function compact(usd: number): string {
  const abs = Math.abs(usd);
  const s = usd < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${s}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${s}$${(abs / 1_000).toFixed(0)}k`;
  return `${s}$${Math.round(abs)}`;
}

/** Tiny debounce — keeps slider thumbs instant, throttles the recompute. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ScenarioModelerClient(props: Props) {
  const { projects, globals, sources, assignments, capTable, todayYM, baseScenario } = props;
  const router = useRouter();

  const [sliders, setSliders] = useState<SliderState>({
    salePriceMultiplier: baseScenario.sale_price_multiplier ?? 1,
    buildCostMultiplier: baseScenario.build_cost_multiplier ?? 1,
    interestRateDeltaBps: baseScenario.interest_rate_delta_bps ?? 0,
    timingShiftMonths: baseScenario.timing_shift_months ?? 0,
    startsPerYear: props.targetStartsPerYear,
  });
  const debounced = useDebounced(sliders, 200);

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const answers = useMemo(() => {
    const scenario: Scenario = {
      ...baseScenario,
      sale_price_multiplier: debounced.salePriceMultiplier,
      build_cost_multiplier: debounced.buildCostMultiplier,
      interest_rate_delta_bps: debounced.interestRateDeltaBps,
      timing_shift_months: debounced.timingShiftMonths,
    };

    const schedule = buildCashSchedule({
      projects: projects.map((p) => ({ uuid: p.uuid, input: p.input })),
      globals,
      scenario,
      sources,
      assignments,
      todayYM,
    });

    const callRow = schedule.rows.find((r) => r.net_cash_need > 1) ?? null;

    const kpc = Object.values(schedule.sources).find((x) => x.sourceKind === 'kpc_loc') ?? null;
    const locHeadroomNow = kpc
      ? (schedule.rows[0]?.by_source[kpc.id]?.headroom ?? kpc.headroomUsd)
      : null;

    const startCap = solveStartCapacity(schedule);
    const selfFund = buildSelfFundingTrajectory(schedule, capTable);

    const dist = buildDistributionForecast(schedule, capTable);
    const nextDist = dist.monthly.find((m) => m.total_distribution > 1) ?? null;

    const rollout = computeRolloutTrigger({
      projects: projects.map((p) => {
        const r = runProject(p.input, globals, scenario);
        const pnl = buildProjectPnL(r, { taxRatePct: p.taxRatePct ?? undefined });
        return {
          project_id: p.uuid,
          recognition_month: r.sale_date,
          npat_usd: pnl.net_profit_after_tax_usd,
        };
      }),
      target_annual_npat_usd: props.rolloutTarget,
      fixed_overhead_annual_usd: props.rolloutOverhead,
      project_time_to_npat_months: props.rolloutTimeToNpat,
      today_month: todayYM,
    });

    return { callRow, locHeadroomNow, hasLoc: kpc !== null, startCap, selfFund, rollout, nextDist };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, projects, globals, sources, assignments, capTable, todayYM]);

  async function handleSave(makeActive: boolean) {
    if (!name.trim()) {
      setSaveMsg('Enter a scenario name first.');
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch('/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          class: 'custom',
          interest_rate_delta_bps: sliders.interestRateDeltaBps,
          build_cost_multiplier: sliders.buildCostMultiplier,
          sale_price_multiplier: sliders.salePriceMultiplier,
          timing_shift_months: sliders.timingShiftMonths,
          starts_per_year_override: sliders.startsPerYear,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }
      const { scenario } = (await res.json()) as { scenario: ScenarioView };
      if (makeActive) {
        await fetch('/api/scenarios/active', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: scenario.id }),
        });
      }
      setSaveMsg(
        makeActive ? `Saved "${scenario.name}" and set active.` : `Saved "${scenario.name}".`
      );
      setName('');
      router.refresh();
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setSliders({
      salePriceMultiplier: baseScenario.sale_price_multiplier ?? 1,
      buildCostMultiplier: baseScenario.build_cost_multiplier ?? 1,
      interestRateDeltaBps: baseScenario.interest_rate_delta_bps ?? 0,
      timingShiftMonths: baseScenario.timing_shift_months ?? 0,
      startsPerYear: props.targetStartsPerYear,
    });
  }

  const dirty =
    sliders.salePriceMultiplier !== (baseScenario.sale_price_multiplier ?? 1) ||
    sliders.buildCostMultiplier !== (baseScenario.build_cost_multiplier ?? 1) ||
    sliders.interestRateDeltaBps !== (baseScenario.interest_rate_delta_bps ?? 0) ||
    sliders.timingShiftMonths !== (baseScenario.timing_shift_months ?? 0) ||
    sliders.startsPerYear !== props.targetStartsPerYear;

  const a = answers;
  const rolloutColor =
    a.rollout.state === 'overdue' || a.rollout.state === 'red'
      ? 'negative'
      : a.rollout.state === 'amber'
        ? 'warning'
        : 'neutral';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(280px, 360px) 1fr',
        gap: 20,
        alignItems: 'start',
      }}
    >
      {/* ── Sliders ─────────────────────────────────────── */}
      <section style={cardStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 16,
          }}
        >
          <h2
            style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}
          >
            Drivers
          </h2>
          {dirty && (
            <button type="button" onClick={reset} style={linkBtn}>
              Reset
            </button>
          )}
        </div>

        <Slider
          label="Sale price"
          value={sliders.salePriceMultiplier}
          min={0.7}
          max={1.3}
          step={0.01}
          display={`${(sliders.salePriceMultiplier * 100).toFixed(0)}%`}
          onChange={(v) => setSliders((s) => ({ ...s, salePriceMultiplier: v }))}
        />
        <Slider
          label="Build cost"
          value={sliders.buildCostMultiplier}
          min={0.7}
          max={1.3}
          step={0.01}
          display={`${(sliders.buildCostMultiplier * 100).toFixed(0)}%`}
          onChange={(v) => setSliders((s) => ({ ...s, buildCostMultiplier: v }))}
        />
        <Slider
          label="Interest rate Δ"
          value={sliders.interestRateDeltaBps}
          min={-500}
          max={500}
          step={25}
          display={`${sliders.interestRateDeltaBps > 0 ? '+' : ''}${(sliders.interestRateDeltaBps / 100).toFixed(2)}%`}
          onChange={(v) => setSliders((s) => ({ ...s, interestRateDeltaBps: v }))}
        />
        <Slider
          label="Timing shift"
          value={sliders.timingShiftMonths}
          min={-12}
          max={12}
          step={1}
          display={`${sliders.timingShiftMonths > 0 ? '+' : ''}${sliders.timingShiftMonths} mo`}
          onChange={(v) => setSliders((s) => ({ ...s, timingShiftMonths: v }))}
        />
        <Slider
          label="Starts / year"
          value={sliders.startsPerYear}
          min={0}
          max={12}
          step={1}
          display={`${sliders.startsPerYear}`}
          onChange={(v) => setSliders((s) => ({ ...s, startsPerYear: v }))}
        />
        <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--color-text-tertiary)' }}>
          Sale, build, rate &amp; timing flow through the engine into every answer. Starts/year is a
          forward-planning knob (saved with the scenario; the live answers model the existing
          project set).
        </p>

        {/* Save */}
        {props.canEdit ? (
          <div
            style={{
              marginTop: 16,
              paddingTop: 16,
              borderTop: '1px solid var(--color-border-hairline)',
            }}
          >
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Scenario name"
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave(false)}
                style={btnSecondary}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave(true)}
                style={btnPrimary}
              >
                Save &amp; activate
              </button>
            </div>
            {saveMsg && (
              <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                {saveMsg}
              </p>
            )}
          </div>
        ) : (
          <p style={{ margin: '16px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            View-only — editors can save scenarios.
          </p>
        )}
      </section>

      {/* ── Answers ─────────────────────────────────────── */}
      <section style={cardStyle}>
        <h2
          style={{
            fontSize: 14,
            fontWeight: 700,
            margin: '0 0 4px',
            color: 'var(--color-text-primary)',
          }}
        >
          Strategic answers{' '}
          {dirty && (
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-tertiary)' }}>
              · live preview (unsaved)
            </span>
          )}
        </h2>

        <AnswerRow
          label="NEXT CAPITAL CALL"
          value={a.callRow ? compact(a.callRow.net_cash_need) : 'None'}
          detail={
            a.callRow
              ? `${fmtYM(a.callRow.month)} · first month with a draw`
              : 'No draws in the 36-month window'
          }
        />
        <AnswerRow
          label="NEXT OWNER DISTRIBUTION"
          value={a.nextDist ? compact(a.nextDist.total_distribution) : 'None'}
          detail={
            a.nextDist
              ? `${fmtYM(a.nextDist.month)} · owner tax distribution at project close`
              : 'No distributions in the 36-month window'
          }
        />
        <AnswerRow
          label="KPC LOC HEADROOM"
          value={a.hasLoc && a.locHeadroomNow != null ? compact(a.locHeadroomNow) : '—'}
          detail={a.hasLoc ? 'Remaining headroom at month 1' : 'No KPC LOC configured'}
        />
        <AnswerRow
          label="ROLLOUT PACING"
          value={
            a.rollout.state === 'unconfigured'
              ? 'Set target'
              : a.rollout.next_start_required_by
                ? `Start by ${fmtYM(a.rollout.next_start_required_by)}`
                : 'On pace'
          }
          detail={
            a.rollout.state === 'unconfigured'
              ? 'Settings → General → annual NPAT target'
              : a.rollout.rationale.slice(0, 90) + (a.rollout.rationale.length > 90 ? '…' : '')
          }
          tone={rolloutColor}
        />
        <AnswerRow
          label="SELF-FUNDING TRAJECTORY"
          value={
            a.selfFund.insufficient_data
              ? '—'
              : a.selfFund.self_funding_year
                ? a.selfFund.self_funding_year
                : 'Beyond 36mo'
          }
          detail={
            a.selfFund.insufficient_data
              ? 'No NPAT recognised in window'
              : a.selfFund.self_funding_year
                ? `Retained NPAT ≥ equity need in FY ${a.selfFund.self_funding_year}`
                : 'Retained NPAT below equity need across the window'
          }
        />
        <AnswerRow
          label="START CAPACITY"
          value={
            a.startCap.state === 'unconfigured'
              ? 'Set covenant'
              : `${a.startCap.max_concurrent_starts_now} ${a.startCap.max_concurrent_starts_now === 1 ? 'start' : 'starts'}`
          }
          detail={
            a.startCap.state === 'unconfigured'
              ? 'LOC max-concurrent covenant not set (Settings → Capital Sources)'
              : a.startCap.rationale.slice(0, 90) + (a.startCap.rationale.length > 90 ? '…' : '')
          }
          tone={a.startCap.state === 'at_capacity' ? 'warning' : 'neutral'}
          last
        />
      </section>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          {label}
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {display}
        </span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--color-accent, #0D0D0D)' }}
      />
    </div>
  );
}

function AnswerRow({
  label,
  value,
  detail,
  tone = 'neutral',
  muted = false,
  last = false,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: 'neutral' | 'warning' | 'negative';
  muted?: boolean;
  last?: boolean;
}) {
  const valueColor = muted
    ? 'var(--color-text-tertiary)'
    : tone === 'negative'
      ? 'var(--color-negative, #b91c1c)'
      : tone === 'warning'
        ? 'var(--color-warning, #a16207)'
        : 'var(--color-text-primary)';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 12,
        padding: '12px 0',
        borderBottom: last ? 'none' : '1px solid var(--color-border-subtle)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-text-tertiary)',
            marginBottom: 3,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: valueColor,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
          }}
        >
          {value}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 3 }}>
          {detail}
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: 'var(--ja-card-bg)',
  border: 'var(--ja-card-border)',
  borderRadius: 'var(--ja-card-radius)',
  padding: 'var(--ja-card-padding)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  border: '1px solid var(--color-border-hairline)',
  borderRadius: 6,
  background: 'var(--color-surface-base)',
  color: 'var(--color-text-primary)',
  boxSizing: 'border-box',
};

const btnPrimary: React.CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  fontSize: 12,
  fontWeight: 700,
  border: 'none',
  borderRadius: 6,
  background: 'var(--color-accent, #0D0D0D)',
  color: '#fff',
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  fontSize: 12,
  fontWeight: 700,
  border: '1px solid var(--color-border-hairline)',
  borderRadius: 6,
  background: 'var(--color-surface-base)',
  color: 'var(--color-text-primary)',
  cursor: 'pointer',
};

const linkBtn: React.CSSProperties = {
  fontSize: 11,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--color-text-tertiary)',
  padding: 0,
};
