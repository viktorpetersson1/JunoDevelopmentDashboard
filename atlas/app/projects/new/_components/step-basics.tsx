'use client';

import { Field } from './field';
import type { CreateProjectInput } from '@/lib/services/project-schema';

const MARKET_OPTIONS = [
  { value: 'default', label: 'Unspecified' },
  { value: 'hamptons', label: 'Hamptons' },
  { value: 'east_hampton', label: 'East Hampton' },
  { value: 'south_hampton', label: 'Southampton' },
  { value: 'sag_harbor', label: 'Sag Harbor' },
  { value: 'montauk', label: 'Montauk' },
  { value: 'shelter_island', label: 'Shelter Island' },
  { value: 'north_fork', label: 'North Fork' },
];

const ASSET_OPTIONS = [
  { value: 'villa', label: 'Single villa' },
  { value: 'multi_villa', label: 'Multi-villa' },
  { value: 'land', label: 'Land only' },
];

const STAGE_OPTIONS = [
  { value: 'sourcing', label: 'Sourcing' },
  { value: 'pre_construction', label: 'Pre-construction' },
  { value: 'construction', label: 'Construction' },
  { value: 'sales', label: 'Sales' },
];

const STATUS_OPTIONS = [
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'committed', label: 'Committed' },
];

export function StepBasics({
  form,
  update,
  errors,
}: {
  form: CreateProjectInput;
  update: <K extends keyof CreateProjectInput>(key: K, value: CreateProjectInput[K]) => void;
  errors: (k: keyof CreateProjectInput) => string | undefined;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Field
        label="Project name"
        name="name"
        kind="text"
        value={form.name}
        onChange={(v) => update('name', (v as string) ?? '')}
        error={errors('name')}
        required
        placeholder="e.g. 84 Sunset Beach Rd"
        hint="Used to generate the URL slug."
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12 }}>
        <Field
          label="Address"
          name="address"
          kind="text"
          value={form.address ?? ''}
          onChange={(v) => update('address', (v as string) || null)}
          error={errors('address')}
          placeholder="Street, town, state"
        />
        <Field
          label="Entity / SPV"
          name="entity_spv"
          kind="text"
          value={form.entity_spv ?? ''}
          onChange={(v) => update('entity_spv', (v as string) || null)}
          error={errors('entity_spv')}
          placeholder="e.g. 84SBR LLC"
        />
      </div>
      <Field
        label="Google Maps URL"
        name="google_maps_url"
        kind="url"
        value={form.google_maps_url ?? ''}
        onChange={(v) => update('google_maps_url', (v as string) || null)}
        error={errors('google_maps_url')}
        placeholder="https://maps.google.com/…"
        hint="Optional. Used by Surface 04 for the location pin."
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
        <Field
          label="Market"
          name="market_id"
          kind="select"
          value={form.market_id}
          onChange={(v) => update('market_id', (v as string) ?? 'default')}
          options={MARKET_OPTIONS}
        />
        <Field
          label="Asset type"
          name="asset_type"
          kind="select"
          value={form.asset_type}
          onChange={(v) => update('asset_type', (v as string) ?? 'villa')}
          options={ASSET_OPTIONS}
        />
        <Field
          label="Stage"
          name="stage"
          kind="select"
          value={form.stage}
          onChange={(v) => update('stage', (v as CreateProjectInput['stage']) ?? 'sourcing')}
          options={STAGE_OPTIONS}
        />
        <Field
          label="Status"
          name="status"
          kind="select"
          value={form.status}
          onChange={(v) => update('status', (v as CreateProjectInput['status']) ?? 'pipeline')}
          options={STATUS_OPTIONS}
        />
      </div>
      <Field
        label="Purchase month"
        name="purchase_date"
        kind="month"
        value={form.purchase_date}
        onChange={(v) => update('purchase_date', (v as string) ?? '')}
        error={errors('purchase_date')}
        required
        hint="Anchors the cash-flow grid (YYYY-MM)."
      />
    </div>
  );
}
