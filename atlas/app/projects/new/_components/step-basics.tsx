'use client';

import { useState } from 'react';
import { Field } from './field';
import type { CreateProjectInput } from '@/lib/services/project-schema';
import {
  WATERFRONT_OPTIONS,
  VIEW_PREMIUM_OPTIONS,
  TOWN_PROXIMITY_OPTIONS,
  type WaterfrontType,
  type ViewPremium,
  type TownProximity,
} from '@/lib/pricing/location-factors';

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

/** Shape returned by POST /api/pricing/classify-location → { classification }. */
interface DetectResult {
  waterfrontType: WaterfrontType | null;
  viewPremium: ViewPremium | null;
  townProximity: TownProximity | null;
  lotSizeAcres: number | null;
  yearBuilt: number | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  usedWebSearch: boolean;
}

export function StepBasics({
  form,
  update,
  errors,
}: {
  form: CreateProjectInput;
  update: <K extends keyof CreateProjectInput>(key: K, value: CreateProjectInput[K]) => void;
  errors: (k: keyof CreateProjectInput) => string | undefined;
}) {
  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function handleDetect() {
    if (!form.address?.trim() || detecting) return;
    setDetecting(true);
    setDetectMsg(null);
    try {
      const marketLabel = MARKET_OPTIONS.find((m) => m.value === form.market_id)?.label ?? null;
      const res = await fetch('/api/pricing/classify-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: form.address.trim(),
          googleMapsUrl: form.google_maps_url || null,
          subMarketLabel: marketLabel,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { data?: { classification?: DetectResult }; error?: { message: string } }
        | null;
      if (!res.ok || !json?.data?.classification) {
        setDetectMsg({ kind: 'err', text: json?.error?.message ?? `Detect failed (HTTP ${res.status})` });
        return;
      }
      const c = json.data.classification;
      if (c.waterfrontType) update('waterfront_type', c.waterfrontType);
      if (c.viewPremium) update('view_premium', c.viewPremium);
      if (c.townProximity) update('town_proximity', c.townProximity);
      if (c.lotSizeAcres != null) update('lot_size_acres', c.lotSizeAcres);
      if (c.yearBuilt != null) update('year_built', c.yearBuilt);
      const filledCount = [
        c.waterfrontType,
        c.viewPremium,
        c.townProximity,
        c.lotSizeAcres,
        c.yearBuilt,
      ].filter((v) => v != null).length;
      if (filledCount === 0) {
        setDetectMsg({
          kind: 'err',
          text: `Couldn't determine location factors${c.reasoning ? ` — ${c.reasoning}` : ''}.`,
        });
      } else {
        setDetectMsg({
          kind: 'ok',
          text: `${c.confidence} confidence${c.usedWebSearch ? ' · web search' : ''}${
            c.reasoning ? ` — ${c.reasoning}` : ''
          } Review and adjust below.`,
        });
      }
    } catch {
      setDetectMsg({ kind: 'err', text: 'Network error — try again.' });
    } finally {
      setDetecting(false);
    }
  }

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

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginTop: 4,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-text-tertiary)',
          }}
        >
          Location factors
        </span>
        <button
          type="button"
          onClick={handleDetect}
          disabled={!form.address?.trim() || detecting}
          title={!form.address?.trim() ? 'Enter an address first' : 'Auto-detect from the address via AI'}
          style={{
            fontSize: 12,
            fontWeight: 500,
            padding: '5px 12px',
            borderRadius: 8,
            border: '1px solid var(--color-border-hairline)',
            background: 'var(--color-surface-base)',
            color: 'var(--color-text-primary)',
            cursor: !form.address?.trim() || detecting ? 'not-allowed' : 'pointer',
            opacity: !form.address?.trim() || detecting ? 0.55 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {detecting ? 'Detecting…' : '✨ Detect from address'}
        </button>
      </div>
      <p style={{ margin: '-8px 0 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        Optional, but the single biggest pricing-quality lever — they let the AI match
        like-for-like comps (a bayfront lot vs an inland one). Enter the address above, then
        Detect to auto-fill — or set them by hand.
      </p>
      {detectMsg && (
        <p
          role={detectMsg.kind === 'err' ? 'alert' : 'status'}
          style={{
            margin: '-4px 0 0 0',
            fontSize: 11,
            lineHeight: 1.5,
            color: detectMsg.kind === 'err' ? 'var(--color-negative, #dc2626)' : 'var(--color-positive, #16a34a)',
          }}
        >
          {detectMsg.text}
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <Field
          label="Waterfront"
          name="waterfront_type"
          kind="select"
          value={form.waterfront_type ?? ''}
          onChange={(v) =>
            update('waterfront_type', (v as CreateProjectInput['waterfront_type']) ?? null)
          }
          options={WATERFRONT_OPTIONS}
          hint="Largest $/SF driver."
        />
        <Field
          label="Water view"
          name="view_premium"
          kind="select"
          value={form.view_premium ?? ''}
          onChange={(v) =>
            update('view_premium', (v as CreateProjectInput['view_premium']) ?? null)
          }
          options={VIEW_PREMIUM_OPTIONS}
        />
        <Field
          label="Town proximity"
          name="town_proximity"
          kind="select"
          value={form.town_proximity ?? ''}
          onChange={(v) =>
            update('town_proximity', (v as CreateProjectInput['town_proximity']) ?? null)
          }
          options={TOWN_PROXIMITY_OPTIONS}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field
          label="Lot size"
          name="lot_size_acres"
          kind="number"
          value={form.lot_size_acres ?? null}
          onChange={(v) => update('lot_size_acres', v === null ? null : Number(v))}
          min={0}
          step={0.01}
          suffix="acres"
          error={errors('lot_size_acres')}
        />
        <Field
          label="Year built"
          name="year_built"
          kind="integer"
          value={form.year_built ?? null}
          onChange={(v) => update('year_built', v === null ? null : Number(v))}
          min={1800}
          max={2100}
          placeholder="e.g. 2026"
          hint="Expected completion for new builds."
          error={errors('year_built')}
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
