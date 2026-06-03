'use client';

/**
 * Actuals Importer (V6.1 T108).
 *
 * Smart CSV upload for the Actuals tab. Multi-step flow inside a single
 * <Modal>: Upload → Preview (LLM-mapped rows) → Commit.
 *
 * Round-trips the validated rows in the response body so the server can
 * be stateless (Cloudflare Pages Functions don't keep memory between
 * requests). The commit endpoint re-validates every row before insert —
 * never trusts the client's "validated" claim.
 *
 * Editor-gated — the launcher button is hidden for viewers via isEditor
 * (passed in by the actuals client). XLSX is rejected with a helpful
 * message (V6-06.a: deferred to V6.1 v2).
 */

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';

type Step = 'upload' | 'preview' | 'success';

interface SampleRow {
  index: number;
  raw: Record<string, string>;
  mapped: {
    entryDate?: string;
    category?: string;
    amountCents?: number;
    lineItem?: string;
    vendor?: string | null;
  };
  valid: boolean;
  errors?: string[];
}

interface DryRunResponse {
  header: string[];
  column_mapping: Record<string, string | null>;
  confidence: number;
  warnings: string[];
  model_used: string;
  rows_total: number;
  rows_valid: number;
  rows_invalid: number;
  total_amount_usd: number;
  sample_rows: SampleRow[];
  validated_rows: Array<Record<string, unknown>>;
}

interface CommitResponse {
  inserted_count: number;
  inserted_ids: string[];
  audit_log_id: string | null;
  total_amount_usd: number;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function ActualsImporter({
  projectKey,
  isEditor,
}: {
  projectKey: string;
  isEditor: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState<DryRunResponse | null>(null);
  const [commit, setCommit] = useState<CommitResponse | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  if (!isEditor) return null;

  function reset() {
    setStep('upload');
    setFileName('');
    setError(null);
    setDryRun(null);
    setCommit(null);
    setBusy(false);
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setTimeout(reset, 220); // after modal exit animation
  }

  async function onFileChosen(file: File) {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB — max is 5 MB.`);
      return;
    }
    if (file.name.toLowerCase().endsWith('.xlsx')) {
      setError(
        'XLSX import is V6.1 v2 — open the file in Excel, File → Save As → CSV, and re-upload.'
      );
      return;
    }
    setFileName(file.name);
    setBusy(true);
    try {
      const text = await file.text();
      const res = await fetch(`/api/projects/${projectKey}/actuals/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'dry_run', file_name: file.name, csv_text: text }),
      });
      const json = (await res.json().catch(() => null)) as
        | { data?: DryRunResponse; error?: { code?: string; message?: string } }
        | null;
      if (!res.ok) {
        setError(json?.error?.message ?? `Dry-run failed (HTTP ${res.status})`);
        setBusy(false);
        return;
      }
      setDryRun(json?.data ?? null);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function onCommit() {
    if (!dryRun) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectKey}/actuals/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase: 'commit',
          file_name: fileName,
          validated_rows: dryRun.validated_rows,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { data?: CommitResponse; error?: { code?: string; message?: string } }
        | null;
      if (!res.ok) {
        setError(json?.error?.message ?? `Commit failed (HTTP ${res.status})`);
        setBusy(false);
        return;
      }
      setCommit(json?.data ?? null);
      setStep('success');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Commit failed');
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void onFileChosen(file);
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Import CSV
      </Button>

      <Modal
        open={open}
        onClose={close}
        title={
          step === 'upload'
            ? 'Import actuals from CSV'
            : step === 'preview'
              ? `Review ${fileName}`
              : 'Imported'
        }
        description={
          step === 'upload'
            ? 'Drop a CSV file of invoices / line items. The system will infer the column mapping.'
            : step === 'preview'
              ? 'Confirm the mapping and commit, or cancel.'
              : `${commit?.inserted_count ?? 0} entries logged.`
        }
        size="xl"
        dismissOnBackdrop={!busy && step !== 'preview'}
        footer={renderFooter()}
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

        {step === 'upload' && (
          <UploadStep
            busy={busy}
            onPick={() => inputRef.current?.click()}
            onDrop={onDrop}
          />
        )}
        {step === 'upload' && (
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFileChosen(f);
            }}
          />
        )}

        {step === 'preview' && dryRun && <PreviewStep dryRun={dryRun} />}

        {step === 'success' && commit && (
          <div style={{ fontSize: 14, color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
            ✅ Logged <b>{commit.inserted_count}</b> entries totalling{' '}
            <b>
              $
              {commit.total_amount_usd.toLocaleString('en-US', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </b>
            .
            {commit.audit_log_id && (
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 8 }}>
                Audit log: <code>{commit.audit_log_id}</code>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );

  function renderFooter() {
    if (step === 'upload') {
      return (
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
        </>
      );
    }
    if (step === 'preview') {
      return (
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onCommit}
            loading={busy}
            disabled={!dryRun || dryRun.rows_valid === 0}
          >
            Commit {dryRun?.rows_valid ?? 0} entries
          </Button>
        </>
      );
    }
    return (
      <Button variant="primary" onClick={close}>
        Done
      </Button>
    );
  }
}

// ── Upload step ──────────────────────────────────────────────────────────────

function UploadStep({
  busy,
  onPick,
  onDrop,
}: {
  busy: boolean;
  onPick: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      onClick={onPick}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onPick();
      }}
      style={{
        border: '2px dashed var(--color-border-hairline)',
        borderRadius: 12,
        padding: '48px 16px',
        textAlign: 'center',
        cursor: busy ? 'wait' : 'pointer',
        background: 'var(--color-surface-muted)',
        color: 'var(--color-text-secondary)',
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)' }}>
        {busy ? 'Analyzing…' : 'Drop CSV here'}
      </div>
      <div style={{ fontSize: 12, marginTop: 6 }}>
        or click to choose · max 5 MB · CSV only (XLSX: save as CSV first)
      </div>
    </div>
  );
}

// ── Preview step ─────────────────────────────────────────────────────────────

function PreviewStep({ dryRun }: { dryRun: DryRunResponse }) {
  const conf = Math.round(dryRun.confidence * 100);
  const confColor =
    dryRun.confidence >= 0.85
      ? 'var(--color-positive, #15803d)'
      : dryRun.confidence >= 0.5
        ? 'var(--color-warning, #a16207)'
        : 'var(--color-negative, #b91c1c)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13 }}>
      {/* Headline KPIs */}
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <Stat label="Valid" value={String(dryRun.rows_valid)} bold />
        <Stat label="Invalid" value={String(dryRun.rows_invalid)} muted={dryRun.rows_invalid === 0} />
        <Stat
          label="Total"
          value={`$${dryRun.total_amount_usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
        />
        <Stat label="Model" value={dryRun.model_used} small />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: confColor,
              display: 'inline-block',
            }}
          />
          <span style={{ fontSize: 12, color: confColor, fontWeight: 700 }}>
            {conf}% confidence
          </span>
        </span>
      </div>

      {/* Column mapping */}
      <div>
        <h4
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-text-tertiary)',
            margin: '0 0 8px',
            fontWeight: 700,
          }}
        >
          Column mapping
        </h4>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <tbody>
            {Object.entries(dryRun.column_mapping).map(([target, source]) => (
              <tr key={target}>
                <td style={mapCellL}>{target}</td>
                <td style={mapCellR}>
                  {source ?? <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Warnings */}
      {dryRun.warnings.length > 0 && (
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 12,
            color: 'var(--color-warning, #a16207)',
          }}
        >
          {dryRun.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      {/* Sample rows */}
      <div style={{ overflowX: 'auto' }}>
        <h4
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-text-tertiary)',
            margin: '0 0 8px',
            fontWeight: 700,
          }}
        >
          Sample rows ({dryRun.sample_rows.length} of {dryRun.rows_total})
        </h4>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Status</Th>
              <Th>Date</Th>
              <Th>Vendor</Th>
              <Th>Category</Th>
              <Th>Amount</Th>
              <Th>Description</Th>
            </tr>
          </thead>
          <tbody>
            {dryRun.sample_rows.map((r) => (
              <tr key={r.index}>
                <Td>{r.index}</Td>
                <Td>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      padding: '1px 6px',
                      borderRadius: 6,
                      color: r.valid
                        ? 'var(--color-positive, #15803d)'
                        : 'var(--color-negative, #b91c1c)',
                      border: `1px solid ${
                        r.valid
                          ? 'var(--color-positive, #15803d)'
                          : 'var(--color-negative, #b91c1c)'
                      }`,
                    }}
                  >
                    {r.valid ? 'ok' : 'invalid'}
                  </span>
                  {r.errors && r.errors.length > 0 && (
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--color-negative, #b91c1c)',
                        marginTop: 2,
                      }}
                    >
                      {r.errors[0]}
                    </div>
                  )}
                </Td>
                <Td>{r.mapped.entryDate ?? '—'}</Td>
                <Td>{r.mapped.vendor ?? '—'}</Td>
                <Td>{r.mapped.category ?? '—'}</Td>
                <Td>
                  {r.mapped.amountCents != null
                    ? `$${(r.mapped.amountCents / 100).toLocaleString('en-US')}`
                    : '—'}
                </Td>
                <Td>{r.mapped.lineItem ?? '—'}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Local primitives ────────────────────────────────────────────────────────

const mapCellL: React.CSSProperties = {
  padding: '4px 8px 4px 0',
  color: 'var(--color-text-tertiary)',
  width: 110,
};
const mapCellR: React.CSSProperties = {
  padding: '4px 0',
  color: 'var(--color-text-primary)',
  fontVariantNumeric: 'tabular-nums',
};

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: 'left',
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--color-text-tertiary)',
        padding: '6px 8px 6px 0',
        borderBottom: '1px solid var(--color-border-hairline)',
        whiteSpace: 'nowrap',
        fontWeight: 700,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td
      style={{
        padding: '6px 8px 6px 0',
        fontSize: 12,
        color: 'var(--color-text-primary)',
        borderBottom: '1px solid var(--color-border-subtle)',
        verticalAlign: 'top',
      }}
    >
      {children}
    </td>
  );
}

function Stat({
  label,
  value,
  bold,
  muted,
  small,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  small?: boolean;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
      <span style={{ color: 'var(--color-text-tertiary)', fontSize: small ? 10 : 11 }}>
        {label}
      </span>
      <span
        style={{
          fontSize: small ? 12 : 14,
          fontWeight: bold ? 700 : 400,
          color: muted ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </span>
  );
}
