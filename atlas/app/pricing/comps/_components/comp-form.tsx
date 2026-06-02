'use client';

/**
 * Shared single-comp form used by /pricing/comps/new and
 * /pricing/comps/[id]/edit.
 *
 * - new mode  : POST  /api/comps
 * - edit mode : PATCH /api/comps/[id]
 *
 * The form derives PSF live as you fill price + sqft so the user sees what
 * the engine will see. Status='closed' enforces closing_date + sale_price;
 * status='active'/'pending' makes them optional (active listings often have
 * no price stamp).
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Field } from '@/app/projects/new/_components/field';
import { Button } from '@/components/ui/Button';
import type { CompView } from '@/lib/repos/comps';

interface SubCutOpt {
  key: string;
  label: string;
}

interface FormState {
  address: string;
  subCutKey: string;
  waterfrontType: string; // '' = unset
  isNc: boolean;
  status: string; // 'closed' | 'active' | 'pending' | 'withdrawn'
  closingDate: string; // YYYY-MM-DD
  salePriceCents: number | null;
  agSqft: number | null;
  lotSizeAcres: number | null;
  yearBuilt: number | null;
  broker: string;
  sourceUrl: string;
  notes: string;
}

function emptyForm(subCutKey: string): FormState {
  return {
    address: '',
    subCutKey,
    waterfrontType: '',
    isNc: false,
    status: 'closed',
    closingDate: '',
    salePriceCents: null,
    agSqft: null,
    lotSizeAcres: null,
    yearBuilt: null,
    broker: '',
    sourceUrl: '',
    notes: '',
  };
}

function fromComp(c: CompView): FormState {
  return {
    address: c.address,
    subCutKey: c.subCutKey,
    waterfrontType: c.waterfrontType ?? '',
    isNc: c.isNc,
    status: c.status,
    closingDate: c.closingDate ?? '',
    salePriceCents: c.salePriceCents,
    agSqft: c.agSqft,
    lotSizeAcres: c.lotSizeAcres,
    yearBuilt: c.yearBuilt,
    broker: c.broker ?? '',
    sourceUrl: c.sourceUrl ?? '',
    notes: c.notes ?? '',
  };
}

const STATUS_OPTS = [
  { value: 'closed', label: 'Closed (sold)' },
  { value: 'active', label: 'Active (on market)' },
  { value: 'pending', label: 'Pending (in contract)' },
  { value: 'withdrawn', label: 'Withdrawn / off-market' },
];

const WATERFRONT_OPTS = [
  { value: '', label: '— None —' },
  { value: 'sound_front_bluff', label: 'Sound-front / bluff' },
  { value: 'bayfront', label: 'Bayfront' },
  { value: 'inlet', label: 'Inlet' },
  { value: 'inland', label: 'Inland' },
];

export function CompForm({
  mode,
  initial,
  subCuts,
}: {
  mode: 'new' | 'edit';
  initial?: CompView;
  subCuts: SubCutOpt[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(
    initial ? fromComp(initial) : emptyForm(subCuts[0]?.key ?? '')
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  const psfPreview = useMemo(() => {
    if (form.status !== 'closed') return null;
    if (!form.salePriceCents || !form.agSqft) return null;
    return form.salePriceCents / 100 / form.agSqft;
  }, [form.status, form.salePriceCents, form.agSqft]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((p) => ({ ...p, [key]: value }));
    setErrors((p) => {
      if (!p[key as string]) return p;
      const { [key as string]: _drop, ...rest } = p;
      return rest;
    });
    setServerError(null);
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!form.address.trim()) e.address = 'Address is required';
    if (!form.subCutKey) e.subCutKey = 'Sub-cut is required';
    if (!form.agSqft || form.agSqft <= 0) e.agSqft = 'AG sqft must be > 0';
    if (form.status === 'closed') {
      if (!form.closingDate) e.closingDate = 'Closing date is required for closed comps';
      if (!form.salePriceCents || form.salePriceCents <= 0)
        e.salePriceCents = 'Sale price is required for closed comps';
    }
    if (form.sourceUrl && !form.sourceUrl.match(/^https?:\/\//)) {
      e.sourceUrl = 'URL must start with http:// or https://';
    }
    return e;
  }

  function handleSubmit() {
    const validation = validate();
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }
    const body = {
      address: form.address.trim(),
      subCutKey: form.subCutKey,
      waterfrontType: form.waterfrontType ? form.waterfrontType : null,
      isNc: form.isNc,
      status: form.status,
      closingDate: form.closingDate || null,
      salePriceCents: form.salePriceCents,
      agSqft: form.agSqft,
      lotSizeAcres: form.lotSizeAcres,
      yearBuilt: form.yearBuilt,
      broker: form.broker.trim() || null,
      sourceUrl: form.sourceUrl.trim() || null,
      notes: form.notes.trim() || null,
    };

    setServerError(null);
    startSubmit(async () => {
      const url = mode === 'new' ? '/api/comps' : `/api/comps/${initial?.id}`;
      const method = mode === 'new' ? 'POST' : 'PATCH';
      const payload = mode === 'new' ? body : { ...body, address: undefined };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          error?: { code: string; message: string };
        } | null;
        setServerError(json?.error?.message ?? `${mode} failed (HTTP ${res.status})`);
        return;
      }
      router.push('/pricing/comps');
      router.refresh();
    });
  }

  async function handleArchive() {
    if (!initial) return;
    if (
      !confirm(
        'Archive this comp? It will disappear from the library; existing pricing-run snapshots are unaffected.'
      )
    ) {
      return;
    }
    const res = await fetch(`/api/comps/${initial.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as {
        error?: { code: string; message: string };
      } | null;
      setServerError(json?.error?.message ?? `Archive failed (HTTP ${res.status})`);
      return;
    }
    router.push('/pricing/comps');
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              margin: 0,
              color: 'var(--color-text-primary)',
            }}
          >
            {mode === 'new' ? 'Add comp' : 'Edit comp'}
          </h1>
          <p
            style={{
              margin: '4px 0 0 0',
              fontSize: 13,
              color: 'var(--color-text-secondary)',
            }}
          >
            {mode === 'edit'
              ? `Pricing-run snapshots of this comp are frozen and unaffected by edits.`
              : 'New comps become available to pricing runs immediately.'}
          </p>
        </div>
        {mode === 'edit' && initial && (
          <Button type="button" variant="secondary" onClick={handleArchive}>
            Archive
          </Button>
        )}
      </header>

      <section
        style={{
          background: 'var(--ja-card-bg)',
          border: 'var(--ja-card-border)',
          borderRadius: 'var(--ja-card-radius)',
          padding: 'var(--ja-card-padding)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
        }}
      >
        <Field
          label="Address"
          name="address"
          kind="text"
          value={mode === 'edit' ? form.address : form.address}
          onChange={(v) => update('address', String(v ?? ''))}
          required
          error={errors.address}
          hint={
            mode === 'edit'
              ? 'Address is immutable; archive + recreate to fix typos.'
              : 'e.g. 1140 Park Ave, Mattituck NY'
          }
        />
        <Field
          label="Sub-cut"
          name="subCutKey"
          kind="select"
          value={form.subCutKey}
          onChange={(v) => update('subCutKey', String(v ?? ''))}
          required
          options={subCuts.map((s) => ({ value: s.key, label: s.label }))}
          error={errors.subCutKey}
        />
        <Field
          label="Status"
          name="status"
          kind="select"
          value={form.status}
          onChange={(v) => update('status', String(v ?? ''))}
          required
          options={STATUS_OPTS}
        />
        <Field
          label="Waterfront type"
          name="waterfrontType"
          kind="select"
          value={form.waterfrontType}
          onChange={(v) => update('waterfrontType', String(v ?? ''))}
          options={WATERFRONT_OPTS}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 0',
          }}
        >
          <input
            id="comp-is-nc"
            type="checkbox"
            checked={form.isNc}
            onChange={(e) => update('isNc', e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <label
            htmlFor="comp-is-nc"
            style={{
              fontSize: 13,
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
            }}
          >
            New construction (NC)
          </label>
        </div>
        <Field
          label="Closing date"
          name="closingDate"
          kind="text"
          value={form.closingDate}
          onChange={(v) => update('closingDate', String(v ?? ''))}
          placeholder="YYYY-MM-DD"
          error={errors.closingDate}
          hint="Required for closed; leave blank for active/pending."
        />
        <Field
          label="Sale price"
          name="salePrice"
          kind="number"
          value={form.salePriceCents !== null ? form.salePriceCents / 100 : null}
          onChange={(v) => {
            if (v === null || v === undefined) {
              update('salePriceCents', null);
              return;
            }
            const usd = Number(v);
            update('salePriceCents', Number.isFinite(usd) ? Math.round(usd * 100) : null);
          }}
          step={1000}
          suffix="USD"
          error={errors.salePriceCents}
        />
        <Field
          label="AG sqft (above grade)"
          name="agSqft"
          kind="integer"
          value={form.agSqft}
          onChange={(v) => update('agSqft', v === null ? null : Number(v))}
          required
          min={1}
          step={50}
          error={errors.agSqft}
          hint={psfPreview != null ? `≈ $${Math.round(psfPreview).toLocaleString()}/sf` : undefined}
        />
        <Field
          label="Lot size"
          name="lotSizeAcres"
          kind="number"
          value={form.lotSizeAcres}
          onChange={(v) => update('lotSizeAcres', v === null ? null : Number(v))}
          suffix="acres"
        />
        <Field
          label="Year built"
          name="yearBuilt"
          kind="integer"
          value={form.yearBuilt}
          onChange={(v) => update('yearBuilt', v === null ? null : Number(v))}
          min={1800}
          max={2100}
        />
        <Field
          label="Broker"
          name="broker"
          kind="text"
          value={form.broker}
          onChange={(v) => update('broker', String(v ?? ''))}
        />
        <Field
          label="Source URL"
          name="sourceUrl"
          kind="url"
          value={form.sourceUrl}
          onChange={(v) => update('sourceUrl', String(v ?? ''))}
          placeholder="https://…"
          error={errors.sourceUrl}
        />
        <div style={{ gridColumn: '1 / -1' }}>
          <label
            htmlFor="comp-notes"
            style={{
              fontSize: 12,
              fontWeight: 400,
              color: 'var(--color-text-secondary)',
              display: 'block',
              marginBottom: 4,
            }}
          >
            Notes
          </label>
          <textarea
            id="comp-notes"
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            rows={3}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: 13,
              border: 'var(--ja-card-border)',
              borderRadius: 8,
              background: 'var(--color-surface-base)',
              color: 'var(--color-text-primary)',
              resize: 'vertical',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
        </div>
      </section>

      {serverError && (
        <p
          role="alert"
          style={{
            margin: 0,
            fontSize: 13,
            color: 'var(--color-negative, #dc2626)',
            background: 'var(--color-surface-base)',
            border: 'var(--ja-card-border)',
            borderLeft: '3px solid var(--color-negative, #dc2626)',
            borderRadius: 8,
            padding: '10px 14px',
          }}
        >
          {serverError}
        </p>
      )}

      <footer style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button type="button" variant="secondary" onClick={() => router.push('/pricing/comps')}>
          Cancel
        </Button>
        <Button type="button" variant="primary" onClick={handleSubmit} loading={isSubmitting}>
          {mode === 'new' ? 'Add comp' : 'Save changes'}
        </Button>
      </footer>
    </div>
  );
}
