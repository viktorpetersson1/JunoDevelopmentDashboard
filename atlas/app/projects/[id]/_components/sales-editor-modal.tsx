'use client';

/**
 * Sales overrides editor (V6.1 T109).
 *
 * Small modal for editing the three sale-override fields via
 * PATCH /api/projects/[id]. Same E1-gated endpoint as the Inputs editor.
 * Editor role only.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/app/projects/new/_components/field';
import type { ProjectInput } from '@/lib/calc/project/types';

interface FormState {
  sale_price_override_usd: number | null;
  sale_price_per_sqft_override: number | null;
  target_margin_pct: number | null; // percent display; sent as decimal
}

export function SalesEditorModal({
  projectKey,
  project,
  isEditor,
}: {
  projectKey: string;
  project: ProjectInput;
  isEditor: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const initial: FormState = {
    sale_price_override_usd: project.sale_price_override_usd ?? null,
    sale_price_per_sqft_override: project.sale_price_per_sqft_override ?? null,
    target_margin_pct:
      project.target_margin != null ? Math.round(project.target_margin * 1000) / 10 : null,
  };
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isEditor) return null;

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        sale_price_override_usd: form.sale_price_override_usd,
        sale_price_per_sqft_override: form.sale_price_per_sqft_override,
        target_margin: form.target_margin_pct != null ? form.target_margin_pct / 100 : null,
      };
      const res = await fetch(`/api/projects/${projectKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setError(json?.error?.message ?? `Save failed (HTTP ${res.status})`);
        setSaving(false);
        return;
      }
      setSaving(false);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setForm(initial);
          setError(null);
          setOpen(true);
        }}
      >
        Edit sale prices
      </Button>

      <Modal
        open={open}
        onClose={() => {
          if (!saving) setOpen(false);
        }}
        title="Edit sale overrides"
        description="Override the engine's exit pricing for this project."
        size="sm"
        dismissOnBackdrop={!saving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>
              Save changes
            </Button>
          </>
        }
      >
        {error && (
          <div
            role="alert"
            style={{
              marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--color-negative, #b91c1c)',
              background: 'var(--color-negative-soft, #fef2f2)',
              color: 'var(--color-negative, #b91c1c)',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field
            label="Sale price override"
            name="sale_price_override_usd"
            kind="number"
            min={0}
            suffix="$"
            hint="Blank = calc engine determines from $/sqft"
            value={form.sale_price_override_usd}
            onChange={(v) =>
              setForm((f) => ({ ...f, sale_price_override_usd: v as number | null }))
            }
          />
          <Field
            label="$/sqft override"
            name="sale_price_per_sqft_override"
            kind="number"
            min={0}
            suffix="$/sqft"
            value={form.sale_price_per_sqft_override}
            onChange={(v) =>
              setForm((f) => ({ ...f, sale_price_per_sqft_override: v as number | null }))
            }
          />
          <Field
            label="Target margin"
            name="target_margin"
            kind="number"
            min={0}
            max={100}
            suffix="%"
            hint="Blank = use global target"
            value={form.target_margin_pct}
            onChange={(v) => setForm((f) => ({ ...f, target_margin_pct: v as number | null }))}
          />
        </div>
      </Modal>
    </>
  );
}
