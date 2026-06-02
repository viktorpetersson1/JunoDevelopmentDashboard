/**
 * V4.7b — Editable driver envelopes for the Monte Carlo run.
 *
 * Server Component (no client state). Renders an HTML form with
 * method=GET so submitting bumps the URL with the new params, and
 * the page Server Component re-renders against them. Bookmarkable;
 * sharable; no client JS required for the basic flow.
 *
 * Defaults come from DEFAULT_DISTRIBUTIONS; current values come from
 * parsed searchParams handed in by the page.
 */

import type { MonteCarloDistributions } from '@/lib/calc/risk/monte-carlo';

interface Props {
  trials: number;
  distributions: MonteCarloDistributions;
  /** When true, render a "Defaults active" indicator so the user knows
   *  they're looking at the canned envelope, not their own. */
  isDefault: boolean;
}

export function DriverControls({ trials, distributions, isDefault }: Props) {
  return (
    <form
      method="GET"
      action="/risk"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <strong style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
            Driver envelopes
          </strong>
          <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Triangular distribution per driver (min / mode / max). Trials clamped to 100–500
            server-side so wait time stays sub-2s.
            {isDefault && ' Currently showing baked-in defaults.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a
            href="/risk"
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 400,
              border: '1px solid var(--color-border-hairline)',
              borderRadius: 8,
              color: 'var(--color-text-primary)',
              background: 'var(--color-surface-base)',
              textDecoration: 'none',
            }}
          >
            Reset to defaults
          </a>
          <button
            type="submit"
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 400,
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              background: 'var(--color-accent-base, #131313)',
              cursor: 'pointer',
            }}
          >
            Run simulation
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <DriverBlock
          label="Sale price ×"
          baseField="sale"
          dist={distributions.sale_price_multiplier}
          step={0.01}
        />
        <DriverBlock
          label="Build cost ×"
          baseField="build"
          dist={distributions.build_cost_multiplier}
          step={0.01}
        />
        <DriverBlock
          label="Interest rate Δ (bps)"
          baseField="rate"
          dist={distributions.interest_rate_delta_bps}
          step={25}
        />
        <DriverBlock
          label="Timing shift (months)"
          baseField="timing"
          dist={distributions.timing_shift_months}
          step={1}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 240px)', gap: 16 }}>
        <Field label="Trials (100-500)">
          <input
            type="number"
            name="trials"
            defaultValue={trials}
            min={100}
            max={500}
            step={25}
            style={inputStyle}
          />
        </Field>
      </div>
    </form>
  );
}

function DriverBlock({
  label,
  baseField,
  dist,
  step,
}: {
  label: string;
  baseField: 'sale' | 'build' | 'rate' | 'timing';
  dist: { min: number; mode: number; max: number };
  step: number;
}) {
  return (
    <div
      style={{
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 10,
        padding: 12,
        background: 'var(--color-surface-base)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--color-text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        <SubField label="min" name={`${baseField}_min`} value={dist.min} step={step} />
        <SubField label="mode" name={`${baseField}_mode`} value={dist.mode} step={step} />
        <SubField label="max" name={`${baseField}_max`} value={dist.max} step={step} />
      </div>
    </div>
  );
}

function SubField({
  label,
  name,
  value,
  step,
}: {
  label: string;
  name: string;
  value: number;
  step: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <label
        style={{
          fontSize: 10,
          color: 'var(--color-text-tertiary)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </label>
      <input type="number" name={name} defaultValue={value} step={step} style={inputStyle} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--color-text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 12,
  border: '1px solid var(--color-border-hairline)',
  borderRadius: 6,
  background: 'var(--color-surface-base)',
  color: 'var(--color-text-primary)',
  fontVariantNumeric: 'tabular-nums',
};
