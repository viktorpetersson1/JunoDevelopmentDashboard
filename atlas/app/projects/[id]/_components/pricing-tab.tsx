'use client';

/**
 * Per-project Pricing tab — the Exit Pricing Framework v1 user surface.
 *
 * Renders one of three states:
 *   1. No runs ever  : empty state + "Create first run" CTA that opens
 *                       the inline plot_types config form.
 *   2. Draft active  : draft editor with per-plot L/B/H + anchor picker +
 *                       triangulation reasoning, commit button.
 *   3. Committed     : run history table with apply / archive buttons,
 *                       latest committed/applied summary tiles.
 *
 * Receives the heavy data from the Server Component above (project row,
 * latest draft bundle, all runs). Owns local state for the draft editor +
 * the new-run config form.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import type {
  PricingRunView,
  PricingRunBundleView,
  PricingRunComparableView,
  PricingRunPlotOutputView,
} from '@/lib/repos/pricing-framework';
import type { ProjectPlotType } from '@/lib/db/schema/projects';

interface SubCutOpt {
  key: string;
  label: string;
}

interface DraftPlotState {
  plotOutputId: string;
  plotTypeKey: string;
  plotTypeLabel: string;
  subCutKey: string;
  lowPsf: number | null;
  basePsf: number | null;
  highPsf: number | null;
  lowAnchorCompSnapshotId: string;
  baseAnchorCompSnapshotId: string;
  highAnchorCompSnapshotId: string;
  triangulationReasoning: string;
}

export function PricingTab({
  projectKey,
  projectPlotTypes,
  appliedRunId,
  runs,
  draftBundle,
  appliedBundle,
  latestCommittedBundle,
  subCuts,
  isEditor,
}: {
  projectKey: string;
  projectPlotTypes: ProjectPlotType[] | null;
  appliedRunId: string | null;
  runs: PricingRunView[];
  draftBundle: PricingRunBundleView | null;
  appliedBundle: PricingRunBundleView | null;
  /** Most-recent committed run (may be the applied one or newer). */
  latestCommittedBundle: PricingRunBundleView | null;
  subCuts: SubCutOpt[];
  isEditor: boolean;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sortedRuns = useMemo(
    () => [...runs].sort((a, b) => b.version - a.version),
    [runs]
  );

  // ─── Empty state — no runs ever ────────────────────────────────────────
  if (runs.length === 0) {
    return (
      <EmptyState
        projectKey={projectKey}
        projectPlotTypes={projectPlotTypes}
        subCuts={subCuts}
        isEditor={isEditor}
      />
    );
  }

  async function handleArchive(runId: string) {
    if (!confirm('Archive this run? You can still see it in history but it cannot be applied.')) {
      return;
    }
    setServerError(null);
    startTransition(async () => {
      const res = await fetch(`/api/pricing-runs/${runId}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as
          | { error?: { code: string; message: string } }
          | null;
        setServerError(json?.error?.message ?? `Archive failed (HTTP ${res.status})`);
        return;
      }
      router.refresh();
    });
  }

  async function handleApply(runId: string) {
    setServerError(null);
    startTransition(async () => {
      const res = await fetch(`/api/pricing-runs/${runId}/apply`, { method: 'POST' });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as
          | { error?: { code: string; message: string } }
          | null;
        setServerError(json?.error?.message ?? `Apply failed (HTTP ${res.status})`);
        return;
      }
      router.refresh();
    });
  }

  // Diff banner — show when there's a newer committed run than the applied one,
  // or when there's a committed run but nothing's applied yet.
  const newerCommittedAvailable =
    latestCommittedBundle &&
    latestCommittedBundle.run.id !== appliedRunId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {newerCommittedAvailable && latestCommittedBundle && (
        <DiffBanner
          latestCommitted={latestCommittedBundle}
          applied={appliedBundle}
          isEditor={isEditor}
          isPending={isPending}
          onApply={() => handleApply(latestCommittedBundle.run.id)}
        />
      )}

      {appliedBundle && (
        <AppliedSummary
          bundle={appliedBundle}
          isCurrent={appliedRunId === appliedBundle.run.id}
        />
      )}

      {draftBundle && isEditor && (
        <DraftEditor
          bundle={draftBundle}
          subCuts={subCuts}
          onCommitted={() => router.refresh()}
          onError={(m) => setServerError(m)}
        />
      )}

      <RunHistory
        runs={sortedRuns}
        appliedRunId={appliedRunId}
        isEditor={isEditor}
        isPending={isPending}
        onArchive={handleArchive}
        onApply={handleApply}
      />

      {isEditor && !draftBundle && (
        <NewRunButton
          projectKey={projectKey}
          projectPlotTypes={projectPlotTypes}
          subCuts={subCuts}
        />
      )}

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
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// EmptyState
// ────────────────────────────────────────────────────────────────────────────

function EmptyState({
  projectKey,
  projectPlotTypes,
  subCuts,
  isEditor,
}: {
  projectKey: string;
  projectPlotTypes: ProjectPlotType[] | null;
  subCuts: SubCutOpt[];
  isEditor: boolean;
}) {
  return (
    <div
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 14,
        padding: 32,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        alignItems: 'center',
      }}
    >
      <div>
        <h3
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
          }}
        >
          No pricing runs yet
        </h3>
        <p
          style={{
            margin: '6px 0 0 0',
            fontSize: 13,
            color: 'var(--color-text-secondary)',
            maxWidth: 480,
          }}
        >
          Create a run to set L / B / H exit PSF per plot type. The engine pre-fills suggestions from
          comp anchors; you commit numbers and pick which one drives the financial model.
        </p>
      </div>
      {isEditor && (
        <NewRunButton
          projectKey={projectKey}
          projectPlotTypes={projectPlotTypes}
          subCuts={subCuts}
        />
      )}
      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
        Need to add comps first?{' '}
        <Link href="/pricing/comps" style={{ color: 'var(--color-text-secondary)' }}>
          Open the comp library →
        </Link>
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// NewRunButton (with inline plot_types config)
// ────────────────────────────────────────────────────────────────────────────

interface PlotConfigRow {
  key: string;
  label: string;
  count: number;
  sqftPerUnitAg: number;
  subCutKey: string;
}

function NewRunButton({
  projectKey,
  projectPlotTypes,
  subCuts,
}: {
  projectKey: string;
  projectPlotTypes: ProjectPlotType[] | null;
  subCuts: SubCutOpt[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<boolean>(false);
  const [plots, setPlots] = useState<PlotConfigRow[]>(() => {
    if (projectPlotTypes && projectPlotTypes.length > 0) {
      return projectPlotTypes.map((p) => ({
        key: p.key,
        label: p.label,
        count: p.count,
        sqftPerUnitAg: p.sqft_per_unit_ag,
        subCutKey: subCuts[0]?.key ?? '',
      }));
    }
    return [
      {
        key: 'main_villa',
        label: 'Main villa',
        count: 1,
        sqftPerUnitAg: 4000,
        subCutKey: subCuts[0]?.key ?? '',
      },
    ];
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  function updatePlot(i: number, patch: Partial<PlotConfigRow>) {
    setPlots((arr) => arr.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  function addRow() {
    setPlots((arr) => [
      ...arr,
      {
        key: `plot_${arr.length + 1}`,
        label: `Plot ${arr.length + 1}`,
        count: 1,
        sqftPerUnitAg: 3000,
        subCutKey: subCuts[0]?.key ?? '',
      },
    ]);
  }

  function removeRow(i: number) {
    setPlots((arr) => arr.filter((_, idx) => idx !== i));
  }

  function handleCreate() {
    setError(null);
    // Basic validation
    const seenKeys = new Set<string>();
    for (const p of plots) {
      if (!p.key.trim()) return setError('Each plot needs a stable key');
      if (seenKeys.has(p.key)) return setError(`Duplicate plot key: ${p.key}`);
      seenKeys.add(p.key);
      if (!p.subCutKey) return setError(`Plot '${p.key}' needs a sub-cut`);
      if (p.count <= 0) return setError(`Plot '${p.key}' count must be > 0`);
      if (p.sqftPerUnitAg <= 0) return setError(`Plot '${p.key}' sqft must be > 0`);
    }
    startSubmit(async () => {
      const res = await fetch(`/api/projects/${projectKey}/pricing-runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `run-create-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        },
        body: JSON.stringify({
          mode: 'on_demand',
          plotTypes: plots,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as
          | { error?: { code: string; message: string } }
          | null;
        setError(json?.error?.message ?? `Create failed (HTTP ${res.status})`);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        Create new pricing run
      </Button>
    );
  }

  return (
    <section
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 14,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        textAlign: 'left',
        width: '100%',
      }}
    >
      <header>
        <h3
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
          }}
        >
          Configure plot types
        </h3>
        <p
          style={{
            margin: '4px 0 0 0',
            fontSize: 12,
            color: 'var(--color-text-secondary)',
          }}
        >
          One row per plot type. Engine snapshots comps in each sub-cut and pre-fills L/B/H.
        </p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {plots.map((p, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns:
                'minmax(140px, 1fr) minmax(180px, 1.5fr) 90px 110px minmax(180px, 1.5fr) auto',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <input
              type="text"
              value={p.key}
              onChange={(e) => updatePlot(i, { key: e.target.value })}
              placeholder="key (sound_front_villa)"
              style={cellInput}
            />
            <input
              type="text"
              value={p.label}
              onChange={(e) => updatePlot(i, { label: e.target.value })}
              placeholder="Label (Sound-front villa)"
              style={cellInput}
            />
            <input
              type="number"
              value={p.count}
              onChange={(e) => updatePlot(i, { count: Number.parseInt(e.target.value, 10) || 0 })}
              min={1}
              style={{ ...cellInput, textAlign: 'right' }}
            />
            <input
              type="number"
              value={p.sqftPerUnitAg}
              onChange={(e) =>
                updatePlot(i, { sqftPerUnitAg: Number.parseInt(e.target.value, 10) || 0 })
              }
              min={1}
              step={100}
              style={{ ...cellInput, textAlign: 'right' }}
            />
            <select
              value={p.subCutKey}
              onChange={(e) => updatePlot(i, { subCutKey: e.target.value })}
              style={cellInput}
            >
              {subCuts.map((sc) => (
                <option key={sc.key} value={sc.key}>
                  {sc.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removeRow(i)}
              style={{
                padding: '6px 10px',
                fontSize: 12,
                background: 'transparent',
                color: 'var(--color-text-tertiary)',
                border: '1px solid var(--color-border-hairline)',
                borderRadius: 6,
                cursor: 'pointer',
              }}
              disabled={plots.length === 1}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          type="button"
          onClick={addRow}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            background: 'var(--color-surface-base)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border-hairline)',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          + Add plot type
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleCreate}
            loading={isSubmitting}
          >
            Create draft run
          </Button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          style={{ margin: 0, fontSize: 12, color: 'var(--color-negative, #dc2626)' }}
        >
          {error}
        </p>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// DraftEditor — the per-plot L/B/H editor
// ────────────────────────────────────────────────────────────────────────────

function DraftEditor({
  bundle,
  subCuts,
  onCommitted,
  onError,
}: {
  bundle: PricingRunBundleView;
  subCuts: SubCutOpt[];
  onCommitted: () => void;
  onError: (msg: string) => void;
}) {
  const [plotState, setPlotState] = useState<DraftPlotState[]>(() =>
    bundle.plotOutputs.map(plotOutputToState)
  );
  const [narrative, setNarrative] = useState<string>(bundle.run.narrativeSummary ?? '');
  const [thesis, setThesis] = useState<string>(bundle.run.buyerMigrationThesis ?? '');
  const [isSubmitting, startSubmit] = useTransition();

  const compsByPlot = useMemo(() => groupCompsByPlot(bundle.comparables), [bundle.comparables]);

  function patchPlot(i: number, patch: Partial<DraftPlotState>) {
    setPlotState((arr) => arr.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  function handleCommit() {
    // Validate every plot has anchors + L/B/H + low<=base<=high
    for (const p of plotState) {
      if (!p.basePsf || p.basePsf <= 0) {
        return onError(`${p.plotTypeLabel}: base PSF must be > 0`);
      }
      if (!p.lowPsf || !p.highPsf) {
        return onError(`${p.plotTypeLabel}: low and high PSF are required`);
      }
      if (!(p.lowPsf <= p.basePsf && p.basePsf <= p.highPsf)) {
        return onError(`${p.plotTypeLabel}: requires low ≤ base ≤ high`);
      }
      if (
        !p.lowAnchorCompSnapshotId ||
        !p.baseAnchorCompSnapshotId ||
        !p.highAnchorCompSnapshotId
      ) {
        return onError(`${p.plotTypeLabel}: anchor comp required for each of L, B, H`);
      }
    }
    startSubmit(async () => {
      const res = await fetch(`/api/pricing-runs/${bundle.run.id}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plots: plotState.map((p) => ({
            plotOutputId: p.plotOutputId,
            lowPsf: p.lowPsf!,
            basePsf: p.basePsf!,
            highPsf: p.highPsf!,
            lowAnchorCompSnapshotId: p.lowAnchorCompSnapshotId,
            baseAnchorCompSnapshotId: p.baseAnchorCompSnapshotId,
            highAnchorCompSnapshotId: p.highAnchorCompSnapshotId,
            triangulationReasoning: p.triangulationReasoning || null,
          })),
          narrativeSummary: narrative || null,
          buyerMigrationThesis: thesis || null,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as
          | { error?: { code: string; message: string } }
          | null;
        onError(json?.error?.message ?? `Commit failed (HTTP ${res.status})`);
        return;
      }
      onCommitted();
    });
  }

  return (
    <section
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 14,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <header>
        <h3
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>Draft v{bundle.run.version}</span>
          <Pill tone="info">draft</Pill>
        </h3>
        <p
          style={{
            margin: '4px 0 0 0',
            fontSize: 12,
            color: 'var(--color-text-secondary)',
          }}
        >
          Engine pre-filled L/B/H from strongest in-sub-cut anchor (base × 0.9 / 1.0 / 1.1). Adjust as needed,
          then commit. Window: {bundle.run.compWindowStart} → {bundle.run.compWindowEnd}.
        </p>
      </header>

      {plotState.map((p, i) => {
        const compsForCut = compsByPlot.get(p.subCutKey) ?? [];
        const subCutLabel = subCuts.find((s) => s.key === p.subCutKey)?.label ?? p.subCutKey;
        return (
          <div
            key={p.plotOutputId}
            style={{
              border: '1px solid var(--color-border-hairline)',
              borderRadius: 10,
              padding: 16,
              background: 'var(--color-surface-base)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <strong style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
                {p.plotTypeLabel}
              </strong>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                Sub-cut: {subCutLabel} · {compsForCut.length} comps in pool
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
              }}
            >
              <PsfBand
                tone="low"
                label="Low"
                value={p.lowPsf}
                onChange={(v) => patchPlot(i, { lowPsf: v })}
                anchorId={p.lowAnchorCompSnapshotId}
                onAnchorChange={(id) => patchPlot(i, { lowAnchorCompSnapshotId: id })}
                comps={compsForCut}
              />
              <PsfBand
                tone="base"
                label="Base"
                value={p.basePsf}
                onChange={(v) => patchPlot(i, { basePsf: v })}
                anchorId={p.baseAnchorCompSnapshotId}
                onAnchorChange={(id) => patchPlot(i, { baseAnchorCompSnapshotId: id })}
                comps={compsForCut}
              />
              <PsfBand
                tone="high"
                label="High"
                value={p.highPsf}
                onChange={(v) => patchPlot(i, { highPsf: v })}
                anchorId={p.highAnchorCompSnapshotId}
                onAnchorChange={(id) => patchPlot(i, { highAnchorCompSnapshotId: id })}
                comps={compsForCut}
              />
            </div>

            <textarea
              placeholder="Triangulation reasoning — why these comps support these numbers"
              value={p.triangulationReasoning}
              onChange={(e) => patchPlot(i, { triangulationReasoning: e.target.value })}
              rows={2}
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: 12,
                border: '1px solid var(--color-border-hairline)',
                borderRadius: 8,
                background: 'var(--color-surface-raised)',
                color: 'var(--color-text-primary)',
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
          </div>
        );
      })}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <NarrativeField
          label="Narrative summary"
          value={narrative}
          onChange={setNarrative}
          placeholder="What this run is telling us…"
        />
        <NarrativeField
          label="Buyer migration thesis"
          value={thesis}
          onChange={setThesis}
          placeholder="Manhattan → East End demand notes (optional)"
        />
      </div>

      <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button type="button" variant="primary" onClick={handleCommit} loading={isSubmitting}>
          Commit run
        </Button>
      </footer>
    </section>
  );
}

function PsfBand({
  tone,
  label,
  value,
  onChange,
  anchorId,
  onAnchorChange,
  comps,
}: {
  tone: 'low' | 'base' | 'high';
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  anchorId: string;
  onAnchorChange: (id: string) => void;
  comps: PricingRunComparableView[];
}) {
  const accent =
    tone === 'low'
      ? 'var(--color-text-tertiary)'
      : tone === 'base'
        ? 'var(--color-text-primary)'
        : 'var(--color-text-secondary)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', color: accent, textTransform: 'uppercase' }}>
        {label} PSF
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>$</span>
        <input
          type="number"
          value={value ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            const n = raw === '' ? null : Number.parseFloat(raw);
            onChange(n !== null && Number.isFinite(n) ? n : null);
          }}
          step={5}
          style={{ ...cellInput, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
        />
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>/sf</span>
      </div>
      <select
        value={anchorId}
        onChange={(e) => onAnchorChange(e.target.value)}
        style={{ ...cellInput, fontSize: 11 }}
      >
        <option value="">— Pick anchor comp —</option>
        {comps.map((c) => (
          <option key={c.id} value={c.id}>
            {c.snapshotAddress} · {c.snapshotPsf ? `$${Math.round(c.snapshotPsf)}/sf` : 'no psf'}
          </option>
        ))}
      </select>
    </div>
  );
}

function NarrativeField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        style={{
          width: '100%',
          padding: '8px 10px',
          fontSize: 12,
          border: '1px solid var(--color-border-hairline)',
          borderRadius: 8,
          background: 'var(--color-surface-base)',
          color: 'var(--color-text-primary)',
          resize: 'vertical',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
        }}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// DiffBanner — surfaces newer-committed-than-applied state
// ────────────────────────────────────────────────────────────────────────────

function DiffBanner({
  latestCommitted,
  applied,
  isEditor,
  isPending,
  onApply,
}: {
  latestCommitted: PricingRunBundleView;
  applied: PricingRunBundleView | null;
  isEditor: boolean;
  isPending: boolean;
  onApply: () => void;
}) {
  // Build a per-plot diff if there's an applied bundle to compare against.
  const appliedByKey = useMemo(() => {
    const m = new Map<string, PricingRunPlotOutputView>();
    if (applied) for (const p of applied.plotOutputs) m.set(p.plotTypeKey, p);
    return m;
  }, [applied]);

  return (
    <section
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderLeft: '3px solid var(--color-warning, #d97706)',
        borderRadius: 12,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <strong style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
            {applied
              ? `Newer committed run available — v${latestCommitted.run.version} (currently applied: v${applied.run.version})`
              : `Pricing run v${latestCommitted.run.version} is committed but not yet applied`}
          </strong>
          <div
            style={{
              fontSize: 12,
              color: 'var(--color-text-secondary)',
              marginTop: 4,
            }}
          >
            {applied
              ? 'Review the per-plot deltas below; apply to refresh the financial model.'
              : 'Apply to push these PSF numbers into the project cash flow.'}
          </div>
        </div>
        {isEditor && (
          <button
            type="button"
            onClick={onApply}
            disabled={isPending}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 500,
              color: '#fff',
              background: 'var(--color-accent-base, #131313)',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Apply v{latestCommitted.run.version}
          </button>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 8,
        }}
      >
        {latestCommitted.plotOutputs.map((p) => {
          const prior = appliedByKey.get(p.plotTypeKey);
          return <PlotDiffChip key={p.id} latest={p} prior={prior ?? null} />;
        })}
      </div>
    </section>
  );
}

function PlotDiffChip({
  latest,
  prior,
}: {
  latest: PricingRunPlotOutputView;
  prior: PricingRunPlotOutputView | null;
}) {
  const latestBase = latest.basePsf ?? 0;
  const priorBase = prior?.basePsf ?? null;
  const deltaPct =
    priorBase && priorBase > 0 ? ((latestBase - priorBase) / priorBase) * 100 : null;
  const deltaSign = deltaPct === null ? '' : deltaPct >= 0 ? '+' : '';
  const deltaTone: 'positive' | 'negative' | 'neutral' =
    deltaPct === null
      ? 'neutral'
      : deltaPct >= 0
        ? 'positive'
        : 'negative';
  return (
    <div
      style={{
        background: 'var(--color-surface-base)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 8,
        padding: 10,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
        {latest.plotTypeLabel}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 13,
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--color-text-primary)',
        }}
      >
        {prior ? (
          <>
            <span style={{ color: 'var(--color-text-tertiary)' }}>${num(priorBase)}</span>
            {' → '}
            <strong>${num(latestBase)}</strong>
            {deltaPct !== null && (
              <>
                {' '}
                <Pill tone={deltaTone}>
                  {deltaSign}
                  {deltaPct.toFixed(1)}%
                </Pill>
              </>
            )}
          </>
        ) : (
          <strong>${num(latestBase)}/sf</strong>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// AppliedSummary — banner showing applied run plot outputs
// ────────────────────────────────────────────────────────────────────────────

function AppliedSummary({
  bundle,
  isCurrent,
}: {
  bundle: PricingRunBundleView;
  isCurrent: boolean;
}) {
  return (
    <section
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderLeft: `3px solid ${isCurrent ? 'var(--color-positive, #16a34a)' : 'var(--color-text-tertiary)'}`,
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          Applied to financial model — v{bundle.run.version}
        </h3>
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          Committed {bundle.run.committedAt ? new Date(bundle.run.committedAt).toLocaleDateString() : '—'}
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 8,
        }}
      >
        {bundle.plotOutputs.map((p) => (
          <PlotChip key={p.id} p={p} />
        ))}
      </div>
    </section>
  );
}

function PlotChip({ p }: { p: PricingRunPlotOutputView }) {
  return (
    <div
      style={{
        background: 'var(--color-surface-base)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 8,
        padding: 10,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
        {p.plotTypeLabel}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 13,
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--color-text-primary)',
        }}
      >
        ${num(p.lowPsf)} / <strong>${num(p.basePsf)}</strong> / ${num(p.highPsf)} /sf
      </div>
      <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {p.classification && <Pill tone={classTone(p.classification)}>{p.classification}</Pill>}
        {p.confidence && <Pill tone={confTone(p.confidence)}>{p.confidence}</Pill>}
        {p.dataGapFlag && <Pill tone="warn">data gap</Pill>}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// RunHistory
// ────────────────────────────────────────────────────────────────────────────

function RunHistory({
  runs,
  appliedRunId,
  isEditor,
  isPending,
  onApply,
  onArchive,
}: {
  runs: PricingRunView[];
  appliedRunId: string | null;
  isEditor: boolean;
  isPending: boolean;
  onApply: (runId: string) => void;
  onArchive: (runId: string) => void;
}) {
  return (
    <section
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <header style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-hairline)' }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          Run history
        </h3>
      </header>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'var(--color-surface-base)' }}>
            <Th>Version</Th>
            <Th>Status</Th>
            <Th>Mode</Th>
            <Th>Window</Th>
            <Th>Committed</Th>
            <Th align="right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const isApplied = appliedRunId === r.id;
            return (
              <tr key={r.id} style={{ borderTop: '1px solid var(--color-border-hairline)' }}>
                <Td>v{r.version}</Td>
                <Td>
                  <Pill tone={runStatusTone(r.status)}>{r.status}</Pill>
                  {isApplied && (
                    <span style={{ marginLeft: 6 }}>
                      <Pill tone="positive">applied</Pill>
                    </span>
                  )}
                </Td>
                <Td>{r.mode}</Td>
                <Td>
                  {r.compWindowStart} → {r.compWindowEnd}
                </Td>
                <Td>{r.committedAt ? new Date(r.committedAt).toLocaleDateString() : '—'}</Td>
                <Td align="right">
                  {isEditor && r.status === 'committed' && !isApplied && (
                    <button
                      type="button"
                      onClick={() => onApply(r.id)}
                      disabled={isPending}
                      style={pillButton('primary')}
                    >
                      Apply
                    </button>
                  )}
                  {isEditor && r.status !== 'archived' && (
                    <button
                      type="button"
                      onClick={() => onArchive(r.id)}
                      disabled={isPending}
                      style={{ ...pillButton('secondary'), marginLeft: 6 }}
                    >
                      Archive
                    </button>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Small visual primitives + helpers
// ────────────────────────────────────────────────────────────────────────────

function Pill({ tone, children }: { tone: 'info' | 'positive' | 'warn' | 'negative' | 'neutral'; children: React.ReactNode }) {
  const styles: React.CSSProperties = {
    display: 'inline-block',
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 4,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  };
  const palettes: Record<string, { bg: string; color: string }> = {
    info: { bg: 'rgba(59,130,246,0.12)', color: '#1d4ed8' },
    positive: { bg: 'rgba(22,163,74,0.12)', color: '#15803d' },
    warn: { bg: 'rgba(234,179,8,0.18)', color: '#854d0e' },
    negative: { bg: 'rgba(220,38,38,0.12)', color: '#b91c1c' },
    neutral: { bg: 'var(--color-surface-base)', color: 'var(--color-text-tertiary)' },
  };
  const palette = palettes[tone] ?? palettes.neutral;
  return <span style={{ ...styles, ...palette }}>{children}</span>;
}

function classTone(c: string): 'positive' | 'info' | 'warn' | 'neutral' {
  if (c === 'rider') return 'positive';
  if (c === 'stretch_rider') return 'info';
  if (c === 'maker') return 'warn';
  return 'neutral';
}
function confTone(c: string): 'positive' | 'info' | 'warn' {
  if (c === 'high') return 'positive';
  if (c === 'medium') return 'info';
  return 'warn';
}
function runStatusTone(s: string): 'positive' | 'info' | 'neutral' | 'negative' {
  if (s === 'committed') return 'positive';
  if (s === 'draft') return 'info';
  if (s === 'archived') return 'neutral';
  return 'negative';
}

function num(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return Math.round(v).toLocaleString();
}

function plotOutputToState(p: PricingRunPlotOutputView): DraftPlotState {
  return {
    plotOutputId: p.id,
    plotTypeKey: p.plotTypeKey,
    plotTypeLabel: p.plotTypeLabel,
    subCutKey: p.subCutKey,
    lowPsf: p.lowPsf,
    basePsf: p.basePsf,
    highPsf: p.highPsf,
    lowAnchorCompSnapshotId: p.lowAnchorCompSnapshotId ?? '',
    baseAnchorCompSnapshotId: p.baseAnchorCompSnapshotId ?? '',
    highAnchorCompSnapshotId: p.highAnchorCompSnapshotId ?? '',
    triangulationReasoning: p.triangulationReasoning ?? '',
  };
}

function groupCompsByPlot(comps: PricingRunComparableView[]): Map<string, PricingRunComparableView[]> {
  const out = new Map<string, PricingRunComparableView[]>();
  for (const c of comps) {
    const arr = out.get(c.snapshotSubCutKey) ?? [];
    arr.push(c);
    out.set(c.snapshotSubCutKey, arr);
  }
  // Sort each list: closed (with psf) first, then by psf desc.
  for (const arr of out.values()) {
    arr.sort((a, b) => {
      if (a.snapshotStatus === 'closed' && b.snapshotStatus !== 'closed') return -1;
      if (b.snapshotStatus === 'closed' && a.snapshotStatus !== 'closed') return 1;
      return (b.snapshotPsf ?? 0) - (a.snapshotPsf ?? 0);
    });
  }
  return out;
}

const cellInput: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 12,
  border: '1px solid var(--color-border-hairline)',
  borderRadius: 6,
  background: 'var(--color-surface-base)',
  color: 'var(--color-text-primary)',
  boxSizing: 'border-box',
  width: '100%',
};

function pillButton(variant: 'primary' | 'secondary'): React.CSSProperties {
  return {
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 500,
    border: '1px solid var(--color-border-hairline)',
    borderRadius: 6,
    cursor: 'pointer',
    background: variant === 'primary' ? 'var(--color-accent-base, #131313)' : 'var(--color-surface-base)',
    color: variant === 'primary' ? '#fff' : 'var(--color-text-primary)',
  };
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' | 'left' }) {
  return (
    <th
      style={{
        textAlign: align ?? 'left',
        padding: '8px 12px',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--color-text-tertiary)',
      }}
    >
      {children}
    </th>
  );
}
function Td({ children, align }: { children: React.ReactNode; align?: 'right' | 'left' }) {
  return (
    <td
      style={{
        textAlign: align ?? 'left',
        padding: '10px 12px',
        color: 'var(--color-text-primary)',
        verticalAlign: 'middle',
      }}
    >
      {children}
    </td>
  );
}
