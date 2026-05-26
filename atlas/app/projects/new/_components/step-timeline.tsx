'use client';

import { Field } from './field';
import type { CreateProjectInput } from '@/lib/services/project-schema';

export function StepTimeline({
  form,
  update,
  errors,
}: {
  form: CreateProjectInput;
  update: <K extends keyof CreateProjectInput>(key: K, value: CreateProjectInput[K]) => void;
  errors: (k: keyof CreateProjectInput) => string | undefined;
}) {
  const totalMonths =
    (form.sourcing_months ?? 0) +
    (form.permitting_preconstruction_months ?? 0) +
    (form.construction_months ?? 0) +
    (form.sales_months ?? 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: 'var(--color-text-tertiary)',
        }}
      >
        Program durations in months — each phase flows into the next
        sequentially. The total drives the cash-flow horizon for this
        project.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <Field
          label="Sourcing"
          name="sourcing_months"
          kind="integer"
          value={form.sourcing_months}
          onChange={(v) => update('sourcing_months', typeof v === 'number' ? v : 0)}
          error={errors('sourcing_months')}
          min={0}
          suffix="mo"
          hint="LOI → closing"
        />
        <Field
          label="Permitting / pre-construction"
          name="permitting_preconstruction_months"
          kind="integer"
          value={form.permitting_preconstruction_months}
          onChange={(v) =>
            update('permitting_preconstruction_months', typeof v === 'number' ? v : 0)
          }
          error={errors('permitting_preconstruction_months')}
          min={0}
          suffix="mo"
          hint="Design, permits, GC selection"
        />
        <Field
          label="Construction"
          name="construction_months"
          kind="integer"
          value={form.construction_months}
          onChange={(v) => update('construction_months', typeof v === 'number' ? v : 0)}
          error={errors('construction_months')}
          required
          min={1}
          suffix="mo"
          hint="Foundation → CofO"
        />
        <Field
          label="Sales"
          name="sales_months"
          kind="integer"
          value={form.sales_months}
          onChange={(v) => update('sales_months', typeof v === 'number' ? v : 0)}
          error={errors('sales_months')}
          required
          min={1}
          suffix="mo"
          hint="List → close"
        />
      </div>

      <section
        style={{
          background: 'var(--color-surface-base)',
          border: '1px solid var(--color-border-hairline)',
          borderRadius: 12,
          padding: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-text-tertiary)',
              marginBottom: 2,
            }}
          >
            Total program
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {totalMonths} months
            {totalMonths > 0 && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 12,
                  color: 'var(--color-text-tertiary)',
                }}
              >
                ≈ {(totalMonths / 12).toFixed(1)} years
              </span>
            )}
          </div>
        </div>
        {form.purchase_date && totalMonths > 0 && (
          <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--color-text-secondary)' }}>
            Target close
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {addMonthsToYM(form.purchase_date, totalMonths)}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function addMonthsToYM(ym: string, n: number): string {
  const parts = ym.split('-').map((s) => Number.parseInt(s, 10));
  const y = parts[0];
  const m = parts[1];
  if (y === undefined || m === undefined || !Number.isInteger(y) || !Number.isInteger(m)) {
    return '—';
  }
  const total = y * 12 + (m - 1) + n;
  const newY = Math.floor(total / 12);
  const newM = (total % 12) + 1;
  return `${newY}-${String(newM).padStart(2, '0')}`;
}
