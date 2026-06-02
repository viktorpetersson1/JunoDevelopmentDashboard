'use client';

/**
 * New project wizard — 4-step form state machine.
 *
 * Steps: Basics → Financials → Timeline → Review
 * Each step Zod-validates the relevant slice before "Next" enables.
 * Review computes preview KPIs via runProject so the user sees what they
 * just committed to before submit. Submit POSTs /api/projects → redirects
 * to /projects/[projectKey] on success.
 *
 * Per CLAUDE.md §10: form state is local React state (no global store).
 * Browser back/forward survives via step query param (?step=2).
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { StepBasics } from './step-basics';
import { StepFinancials } from './step-financials';
import { StepTimeline } from './step-timeline';
import { StepReview } from './step-review';
import { CreateProjectSchema, type CreateProjectInput } from '@/lib/services/project-schema';

/**
 * Default values for any unfilled field. Sourced from BASELINE_GLOBALS
 * intent — picking sensible Hamptons defaults so the wizard surfaces
 * working numbers from step 1.
 */
const INITIAL: CreateProjectInput = {
  name: '',
  address: null,
  entity_spv: null,
  google_maps_url: null,
  market_id: 'default',
  asset_type: 'villa',
  status: 'pipeline',
  stage: 'sourcing',
  waterfront_type: null,
  view_premium: null,
  town_proximity: null,
  lot_size_acres: null,
  year_built: null,
  purchase_date: new Date().toISOString().slice(0, 7),
  villa_sqft_ag: 0,
  villa_sqft_bg: 0,
  sourcing_months: 2,
  permitting_preconstruction_months: 3,
  construction_months: 12,
  sales_months: 3,
  land_cost_usd: 0,
  build_cost_per_sqft: null,
  soft_costs_lump_sum: 0,
  tax_rate_pct: 25,
};

const STEPS = [
  {
    id: 1,
    label: 'Basics',
    fields: [
      'name',
      'address',
      'market_id',
      'asset_type',
      'purchase_date',
      'waterfront_type',
      'view_premium',
      'town_proximity',
      'lot_size_acres',
      'year_built',
    ],
  },
  {
    id: 2,
    label: 'Financials',
    fields: [
      'villa_sqft_ag',
      'villa_sqft_bg',
      'land_cost_usd',
      'build_cost_per_sqft',
      'soft_costs_lump_sum',
      'tax_rate_pct',
    ],
  },
  {
    id: 3,
    label: 'Timeline',
    fields: [
      'sourcing_months',
      'permitting_preconstruction_months',
      'construction_months',
      'sales_months',
    ],
  },
  { id: 4, label: 'Review', fields: [] as string[] },
] as const;

export function NewProjectWizard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const stepFromUrl = Number.parseInt(params.get('step') ?? '1', 10);
  const initialStep =
    Number.isInteger(stepFromUrl) && stepFromUrl >= 1 && stepFromUrl <= 4 ? stepFromUrl : 1;

  const [step, setStep] = useState<number>(initialStep);
  const [form, setForm] = useState<CreateProjectInput>(INITIAL);
  const [errorPerField, setErrorPerField] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  function update<K extends keyof CreateProjectInput>(key: K, value: CreateProjectInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrorPerField((prev) => {
      if (!prev[key as string]) return prev;
      const { [key as string]: _drop, ...rest } = prev;
      return rest;
    });
    setServerError(null);
  }

  // Per-step validation. Run the full Zod schema, then filter issues down
  // to the fields the current step owns. Returns true when the step is
  // ready to advance.
  const stepValidation = useMemo(() => {
    const parsed = CreateProjectSchema.safeParse(form);
    if (parsed.success) return { ok: true, issues: {} as Record<string, string> };
    const currentFields = new Set<string>(STEPS[step - 1]?.fields ?? []);
    const issues: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const path = i.path.join('.');
      if (currentFields.has(path)) issues[path] = i.message;
    }
    return { ok: Object.keys(issues).length === 0, issues };
  }, [form, step]);

  function goToStep(next: number) {
    const clamped = Math.max(1, Math.min(STEPS.length, next));
    setStep(clamped);
    router.replace(`${pathname}?step=${clamped}`, { scroll: false });
  }

  function handleNext() {
    if (!stepValidation.ok) {
      setErrorPerField(stepValidation.issues);
      return;
    }
    goToStep(step + 1);
  }

  function handleBack() {
    setErrorPerField({});
    setServerError(null);
    goToStep(step - 1);
  }

  function handleSubmit() {
    const parsed = CreateProjectSchema.safeParse(form);
    if (!parsed.success) {
      const issues: Record<string, string> = {};
      for (const i of parsed.error.issues) issues[i.path.join('.')] = i.message;
      setErrorPerField(issues);
      // Jump back to the earliest invalid step.
      for (const s of STEPS) {
        if (s.fields.some((f) => issues[f])) {
          goToStep(s.id);
          break;
        }
      }
      return;
    }

    setServerError(null);
    startSubmit(async () => {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { code: string; message: string };
        } | null;
        setServerError(body?.error?.message ?? `Create failed (HTTP ${res.status})`);
        return;
      }

      const body = (await res.json()) as {
        data: { id: string; projectKey: string };
      };

      // D-025a — auto-generate the Pricing Strategy Brief for the new project.
      // Fire-and-forget with keepalive so the request survives the navigation
      // below. The user lands on the project page; once the brief lands (~20s)
      // they refresh (or the Pricing tab refetches on mount via Server Component).
      // If this fails silently, the empty-state on the Pricing tab still works.
      try {
        void fetch(`/api/projects/${body.data.projectKey}/pricing-brief`, {
          method: 'POST',
          keepalive: true,
        });
      } catch {
        // best-effort
      }

      router.push(`/projects/${body.data.projectKey}?tab=pricing`);
      router.refresh();
    });
  }

  const errorsForField = (k: keyof CreateProjectInput): string | undefined =>
    errorPerField[k as string];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <header>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            margin: 0,
            color: 'var(--color-text-primary)',
          }}
        >
          New project
        </h1>
        <p
          style={{
            margin: '4px 0 0 0',
            fontSize: 13,
            color: 'var(--color-text-secondary)',
          }}
        >
          Step {step} of {STEPS.length} · {STEPS[step - 1]?.label ?? ''}
        </p>
      </header>

      <StepIndicator step={step} steps={STEPS} />

      <section
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border-hairline)',
          borderRadius: 14,
          padding: 24,
        }}
      >
        {step === 1 && <StepBasics form={form} update={update} errors={errorsForField} />}
        {step === 2 && <StepFinancials form={form} update={update} errors={errorsForField} />}
        {step === 3 && <StepTimeline form={form} update={update} errors={errorsForField} />}
        {step === 4 && <StepReview form={form} />}
      </section>

      {serverError && (
        <p
          role="alert"
          style={{
            margin: 0,
            fontSize: 13,
            color: 'var(--color-negative, #dc2626)',
            background: 'var(--color-surface-base)',
            border: '1px solid var(--color-border-hairline)',
            borderLeft: '3px solid var(--color-negative, #dc2626)',
            borderRadius: 8,
            padding: '10px 14px',
          }}
        >
          {serverError}
        </p>
      )}

      <footer
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <Button
          type="button"
          variant="secondary"
          onClick={handleBack}
          disabled={step === 1 || isSubmitting}
        >
          Back
        </Button>
        {step < STEPS.length ? (
          <Button type="button" variant="primary" onClick={handleNext}>
            Next
          </Button>
        ) : (
          <Button type="button" variant="primary" onClick={handleSubmit} loading={isSubmitting}>
            Create project
          </Button>
        )}
      </footer>
    </div>
  );
}

function StepIndicator({ step, steps }: { step: number; steps: typeof STEPS }) {
  return (
    <ol
      style={{
        display: 'flex',
        gap: 8,
        listStyle: 'none',
        padding: 0,
        margin: 0,
      }}
    >
      {steps.map((s) => {
        const state = s.id === step ? 'active' : s.id < step ? 'done' : 'todo';
        const bg =
          state === 'active'
            ? 'var(--color-accent-base, #131313)'
            : state === 'done'
              ? 'var(--color-positive, #16a34a)'
              : 'var(--color-surface-sunken)';
        const color = state === 'todo' ? 'var(--color-text-tertiary)' : '#fff';
        return (
          <li
            key={s.id}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 8,
              background: bg,
              color,
              fontSize: 12,
              fontWeight: 700,
              textAlign: 'center',
              letterSpacing: '0.02em',
              border: state === 'todo' ? '1px solid var(--color-border-hairline)' : 'none',
            }}
          >
            {s.id}. {s.label}
          </li>
        );
      })}
    </ol>
  );
}
