'use client';

/**
 * Settings → Cap Table tab. Admins can edit share %, sum must equal 100%
 * (10000 bps) before submit. Server-side enforces the invariant via the
 * existing deferrable trigger on atlas.cap_table.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import type { CapTableEntryView } from '@/lib/repos/settings';

interface DraftRow {
  ownerId: string;
  ownerKey: string;
  displayName: string;
  isSponsor: boolean;
  // User-facing percent string (e.g. "38.00"), parsed into bps on submit.
  pct: string;
}

const BPS_TO_PCT = (bps: number): string => (bps / 100).toFixed(2);
const PCT_TO_BPS = (pct: string): number => Math.round(parseFloat(pct) * 100);

export function CapTableTab({
  entries,
  isAdmin,
}: {
  entries: CapTableEntryView[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftRow[]>(() =>
    entries.map((e) => ({
      ownerId: e.ownerId,
      ownerKey: e.ownerKey,
      displayName: e.displayName,
      isSponsor: e.isSponsor,
      pct: BPS_TO_PCT(e.shareBps),
    }))
  );
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { sumBps, hasInvalidNumbers } = useMemo(() => {
    let total = 0;
    let bad = false;
    for (const r of draft) {
      const n = parseFloat(r.pct);
      if (!Number.isFinite(n) || n < 0 || n > 100) bad = true;
      else total += PCT_TO_BPS(r.pct);
    }
    return { sumBps: total, hasInvalidNumbers: bad };
  }, [draft]);

  const sumPct = (sumBps / 100).toFixed(2);
  const sumOk = sumBps === 10000 && !hasInvalidNumbers;
  const isDirty = useMemo(
    () =>
      draft.some((r, i) => {
        const original = entries[i];
        return original ? PCT_TO_BPS(r.pct) !== original.shareBps : false;
      }),
    [draft, entries]
  );

  function updatePct(ownerId: string, value: string) {
    setDraft((prev) => prev.map((r) => (r.ownerId === ownerId ? { ...r, pct: value } : r)));
    setServerError(null);
    setSavedAt(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sumOk || !isDirty) return;
    setServerError(null);
    startTransition(async () => {
      const body = {
        shares: draft.map((r) => ({
          ownerId: r.ownerId,
          shareBps: PCT_TO_BPS(r.pct),
        })),
      };
      const res = await fetch('/api/settings/cap-table', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        setServerError(text || `Save failed (${res.status})`);
        return;
      }
      setSavedAt(new Date().toISOString());
      router.refresh();
    });
  }

  if (entries.length === 0) {
    return (
      <section
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border-hairline)',
          borderRadius: 14,
          padding: '32px 24px',
          textAlign: 'center',
        }}
      >
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 13 }}>
          No cap-table entries yet. Seed via SQL or wait for the owner onboarding wizard.
        </p>
      </section>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border-hairline)',
          borderRadius: 14,
          padding: 24,
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 16,
          }}
        >
          <h3
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-text-tertiary)',
              margin: 0,
            }}
          >
            Current shares
          </h3>
          <span
            aria-live="polite"
            style={{
              fontSize: 12,
              fontVariantNumeric: 'tabular-nums',
              color: sumOk ? 'var(--color-positive, #16a34a)' : 'var(--color-negative, #dc2626)',
              fontWeight: 600,
            }}
          >
            {sumPct}% / 100%
          </span>
        </header>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <Th align="left">Owner</Th>
              <Th align="left">Role</Th>
              <Th align="right">Share</Th>
            </tr>
          </thead>
          <tbody>
            {draft.map((r) => (
              <tr key={r.ownerId}>
                <Td>{r.displayName}</Td>
                <Td muted>{r.isSponsor ? 'Sponsor' : 'Owner'}</Td>
                <td style={tdNumStyle}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      justifyContent: 'flex-end',
                    }}
                  >
                    <input
                      aria-label={`${r.displayName} share percent`}
                      disabled={!isAdmin || isPending}
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={r.pct}
                      onChange={(e) => updatePct(r.ownerId, e.target.value)}
                      style={{
                        width: 72,
                        padding: '4px 6px',
                        fontSize: 13,
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        border: '1px solid var(--color-border-hairline)',
                        borderRadius: 6,
                        background: 'var(--color-surface-base)',
                        color: 'var(--color-text-primary)',
                      }}
                    />
                    <span style={{ color: 'var(--color-text-tertiary)' }}>%</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {!sumOk && (
        <p
          role="alert"
          style={{
            margin: 0,
            fontSize: 12,
            color: 'var(--color-negative, #dc2626)',
          }}
        >
          Shares must sum to exactly 100% before saving (current: {sumPct}%).
        </p>
      )}

      {serverError && (
        <p
          role="alert"
          style={{
            margin: 0,
            fontSize: 12,
            color: 'var(--color-negative, #dc2626)',
          }}
        >
          {serverError}
        </p>
      )}

      {savedAt && !isDirty && (
        <p
          role="status"
          style={{
            margin: 0,
            fontSize: 12,
            color: 'var(--color-positive, #16a34a)',
          }}
        >
          Saved.
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {!isAdmin && (
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', alignSelf: 'center' }}>
            Read-only — super_admin role required to edit.
          </span>
        )}
        {isAdmin && (
          <Button type="submit" variant="primary" disabled={!sumOk || !isDirty} loading={isPending}>
            Save shares
          </Button>
        )}
      </div>
    </form>
  );
}

const tdNumStyle: React.CSSProperties = {
  padding: '8px 0',
  fontSize: 13,
  textAlign: 'right',
  borderBottom: '1px solid var(--color-border-subtle)',
};

function Th({ children, align }: { children: React.ReactNode; align: 'left' | 'right' }) {
  return (
    <th
      style={{
        textAlign: align,
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--color-text-tertiary)',
        padding: '8px 12px 8px 0',
        borderBottom: '1px solid var(--color-border-hairline)',
        whiteSpace: 'nowrap',
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
        padding: '8px 12px 8px 0',
        fontSize: 13,
        color: muted ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
        borderBottom: '1px solid var(--color-border-subtle)',
      }}
    >
      {children}
    </td>
  );
}
