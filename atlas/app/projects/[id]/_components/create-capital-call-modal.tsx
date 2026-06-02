'use client';

/**
 * Create-capital-call modal — admin only.
 *
 * Lets the user enter a total amount, due date, and (optional) notes,
 * then either accept the cap-table auto-split OR manually adjust per
 * owner. The preview table sums to total in real time; submit is gated
 * on sum == total.
 *
 * Submit POSTs /api/capital-calls (idempotency key included so a double-
 * tap doesn't create two calls). On success, refreshes the page so the
 * new call shows up in the list.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { formatMoney } from '@/lib/utils/money';
import type { CapTableEntryView } from '@/lib/repos/settings';

type SplitMode = 'cap_table' | 'manual';

interface DraftShare {
  ownerId: string;
  ownerKey: string;
  ownerName: string;
  shareBps: number; // for cap-table mode, displayed; for manual, computed
  amountCents: number;
}

export function CreateCapitalCallModal({
  projectUuid,
  capTable,
  onClose,
}: {
  projectUuid: string;
  capTable: CapTableEntryView[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [totalDollars, setTotalDollars] = useState<string>('0');
  const [dueDate, setDueDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [splitMode, setSplitMode] = useState<SplitMode>('cap_table');
  const [issue, setIssue] = useState<boolean>(true);
  const [manualShares, setManualShares] = useState<DraftShare[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  const totalCents = Math.round((Number.parseFloat(totalDollars) || 0) * 100);

  // Compute the cap-table preview using largest-remainder allocation so the
  // shares sum exactly to total. Matches the server-side algorithm in
  // lib/services/capital-call.ts → resolveSplit.
  const capTableShares = useMemo<DraftShare[]>(() => {
    if (totalCents <= 0 || capTable.length === 0) return [];
    const provisional = capTable.map((e) => ({
      ownerId: e.ownerId,
      ownerKey: e.ownerKey,
      ownerName: e.displayName,
      shareBps: e.shareBps,
      floor: Math.floor((totalCents * e.shareBps) / 10000),
      remainder: (totalCents * e.shareBps) % 10000,
    }));
    const allocated = provisional.reduce((s, p) => s + p.floor, 0);
    const drift = totalCents - allocated;
    const sorted = [...provisional].sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < drift; i++) sorted[i % sorted.length]!.floor += 1;
    return provisional.map((p) => ({
      ownerId: p.ownerId,
      ownerKey: p.ownerKey,
      ownerName: p.ownerName,
      shareBps: p.shareBps,
      amountCents: p.floor,
    }));
  }, [totalCents, capTable]);

  // Active shares is whichever mode is selected.
  const activeShares: DraftShare[] =
    splitMode === 'cap_table' ? capTableShares : (manualShares ?? capTableShares);
  const shareSumCents = activeShares.reduce((s, r) => s + r.amountCents, 0);
  const sumOk = totalCents > 0 && shareSumCents === totalCents;

  function switchToManual() {
    setSplitMode('manual');
    if (!manualShares) setManualShares(capTableShares);
  }
  function switchToCapTable() {
    setSplitMode('cap_table');
    setManualShares(null);
  }

  function updateManualAmount(ownerId: string, dollars: string) {
    const cents = Math.round((Number.parseFloat(dollars) || 0) * 100);
    setManualShares((prev) =>
      (prev ?? capTableShares).map((s) =>
        s.ownerId === ownerId ? { ...s, amountCents: Math.max(0, cents) } : s
      )
    );
  }

  function handleSubmit() {
    if (!sumOk) {
      setError(
        `Shares must sum to total ($${(totalCents / 100).toFixed(2)}); got $${(shareSumCents / 100).toFixed(2)}`
      );
      return;
    }
    setError(null);
    startSubmit(async () => {
      // Idempotency key prevents double-create on retry / double-click.
      const idempotencyKey = `cc-${projectUuid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const body: Record<string, unknown> = {
        projectId: projectUuid,
        totalAmountCents: totalCents,
        issue,
        dueDate: dueDate || null,
        notes: notes || null,
      };
      if (splitMode === 'cap_table') {
        body.split = 'cap_table';
      } else {
        body.split = activeShares.map((s) => ({
          ownerId: s.ownerId,
          shareAmountCents: s.amountCents,
        }));
      }
      const res = await fetch('/api/capital-calls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as {
          error?: { message: string };
        } | null;
        setError(errBody?.error?.message ?? `Create failed (HTTP ${res.status})`);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create capital call"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 100,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--color-surface-base)',
          border: '1px solid var(--color-border-hairline)',
          borderRadius: 14,
          width: '100%',
          maxWidth: 720,
          maxHeight: '90vh',
          overflow: 'auto',
          padding: 24,
        }}
      >
        <header style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>New capital call</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Pick a total, split among owners, and issue. Owners can then commit + fund their share.
          </p>
        </header>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 12 }}>
            <LabeledInput
              label="Total amount (USD)"
              type="number"
              value={totalDollars}
              onChange={setTotalDollars}
              min={0}
              step={1000}
              placeholder="e.g. 500000"
              required
            />
            <LabeledInput label="Due date" type="date" value={dueDate} onChange={setDueDate} />
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                fontSize: 12,
                color: 'var(--color-text-secondary)',
              }}
            >
              Status on create
              <select
                value={issue ? 'issued' : 'draft'}
                onChange={(e) => setIssue(e.target.value === 'issued')}
                style={inputStyle}
              >
                <option value="draft">draft</option>
                <option value="issued">issued</option>
              </select>
            </label>
          </div>

          <LabeledInput
            label="Notes (optional)"
            type="text"
            value={notes}
            onChange={setNotes}
            placeholder="Reason for call, source, special instructions"
          />

          <section>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 8,
              }}
            >
              <h3
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--color-text-secondary)',
                  margin: 0,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                Split
              </h3>
              <div style={{ display: 'flex', gap: 4 }}>
                <SplitToggleButton active={splitMode === 'cap_table'} onClick={switchToCapTable}>
                  Cap-table auto
                </SplitToggleButton>
                <SplitToggleButton active={splitMode === 'manual'} onClick={switchToManual}>
                  Manual override
                </SplitToggleButton>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <Th align="left">Owner</Th>
                  <Th align="right">Share</Th>
                  <Th align="right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {activeShares.map((s) => (
                  <tr key={s.ownerId}>
                    <Td>{s.ownerName}</Td>
                    <Td muted>{(s.shareBps / 100).toFixed(2)}%</Td>
                    <td style={{ padding: '6px 0', textAlign: 'right' }}>
                      {splitMode === 'manual' ? (
                        <input
                          type="number"
                          value={(s.amountCents / 100).toString()}
                          onChange={(e) => updateManualAmount(s.ownerId, e.target.value)}
                          min={0}
                          step={100}
                          style={{ ...inputStyle, width: 140, textAlign: 'right' }}
                        />
                      ) : (
                        <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                          {formatMoney(s.amountCents, { precision: 0 })}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {activeShares.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      style={{
                        padding: '16px 0',
                        textAlign: 'center',
                        color: 'var(--color-text-tertiary)',
                        fontSize: 12,
                      }}
                    >
                      Enter a total to preview the split
                    </td>
                  </tr>
                )}
              </tbody>
              {activeShares.length > 0 && (
                <tfoot>
                  <tr>
                    <td
                      style={{
                        padding: '8px 0',
                        fontSize: 12,
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      Sum
                    </td>
                    <td />
                    <td
                      style={{
                        padding: '8px 0',
                        textAlign: 'right',
                        fontSize: 13,
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 700,
                        color: sumOk
                          ? 'var(--color-positive, #16a34a)'
                          : 'var(--color-negative, #dc2626)',
                      }}
                    >
                      {formatMoney(shareSumCents, { precision: 0 })}
                      {' / '}
                      {formatMoney(totalCents, { precision: 0 })}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </section>

          {error && (
            <p
              role="alert"
              style={{ margin: 0, fontSize: 12, color: 'var(--color-negative, #dc2626)' }}
            >
              {error}
            </p>
          )}

          <footer
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              paddingTop: 8,
              borderTop: '1px solid var(--color-border-subtle)',
            }}
          >
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={isSubmitting}
              disabled={!sumOk || totalCents <= 0}
            >
              Create call
            </Button>
          </footer>
        </div>
      </div>
    </div>
  );
}

// ─── Small primitives (kept inline so the modal is self-contained) ─────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: 14,
  border: '1px solid var(--color-border-hairline)',
  borderRadius: 8,
  background: 'var(--color-surface-base)',
  color: 'var(--color-text-primary)',
  boxSizing: 'border-box',
};

function LabeledInput({
  label,
  type,
  value,
  onChange,
  placeholder,
  required,
  min,
  step,
}: {
  label: string;
  type: 'text' | 'number' | 'date';
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  min?: number;
  step?: number;
}) {
  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        fontSize: 12,
        color: 'var(--color-text-secondary)',
      }}
    >
      {label}
      {required && <span style={{ color: 'var(--color-negative, #dc2626)' }}> *</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        step={step}
        style={inputStyle}
      />
    </label>
  );
}

function SplitToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 10px',
        fontSize: 11,
        fontWeight: 400,
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 6,
        background: active ? 'var(--color-accent-base, #131313)' : 'transparent',
        color: active ? '#fff' : 'var(--color-text-secondary)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function Th({ children, align }: { children: React.ReactNode; align: 'left' | 'right' }) {
  return (
    <th
      style={{
        textAlign: align,
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--color-text-tertiary)',
        padding: '6px 0',
        borderBottom: '1px solid var(--color-border-hairline)',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <td
      style={{
        padding: '8px 0',
        fontSize: 13,
        color: muted ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
        borderBottom: '1px solid var(--color-border-subtle)',
      }}
    >
      {children}
    </td>
  );
}
