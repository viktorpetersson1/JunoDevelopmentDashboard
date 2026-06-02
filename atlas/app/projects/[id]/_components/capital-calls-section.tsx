'use client';

/**
 * Capital calls section — list of calls + create-call modal trigger.
 *
 * Per call card:
 *   - Status pill, call number, total, issued/due dates
 *   - Owner shares table with paid + status per owner
 *   - "Cancel call" (admin, blocked if any payments)
 *
 * Per share row:
 *   - "Commit" button (only on own share, only if pending)
 *   - "Record payment" button (admin only; opens inline form)
 *
 * D-011 tier 2: viewer / viewer_basic users receive only their own
 * shares from the server, so the table renders 1 row in that case.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { formatMoney } from '@/lib/utils/money';
import { CreateCapitalCallModal } from './create-capital-call-modal';
import { RecordPaymentForm } from './record-payment-form';
import type { CapitalCallView, OwnerShareStatus } from '@/lib/repos/capital-call';
import type { CapTableEntryView } from '@/lib/repos/settings';

export function CapitalCallsSection({
  projectUuid,
  calls,
  capTable,
  isAdmin,
}: {
  projectUuid: string | null;
  calls: CapitalCallView[];
  capTable: CapTableEntryView[];
  isAdmin: boolean;
}) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
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
          gap: 12,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              margin: 0,
              color: 'var(--color-text-primary)',
            }}
          >
            Capital calls
          </h2>
          <p
            style={{
              margin: '2px 0 0 0',
              fontSize: 12,
              color: 'var(--color-text-tertiary)',
            }}
          >
            {isAdmin
              ? `${calls.length} ${calls.length === 1 ? 'call' : 'calls'} on file`
              : 'Showing your commitments only'}
          </p>
        </div>
        {isAdmin && projectUuid && (
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            + New call
          </Button>
        )}
      </header>

      {calls.length === 0 ? (
        <div
          style={{
            padding: '32px 16px',
            textAlign: 'center',
            border: '1px dashed var(--color-border-hairline)',
            borderRadius: 12,
            color: 'var(--color-text-secondary)',
            fontSize: 13,
          }}
        >
          {isAdmin
            ? 'No capital calls yet for this project. Create one to split costs across the cap table.'
            : 'No capital calls in your history for this project.'}
        </div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {calls.map((c) => (
            <li key={c.id}>
              <CapitalCallCard call={c} isAdmin={isAdmin} />
            </li>
          ))}
        </ul>
      )}

      {createOpen && projectUuid && (
        <CreateCapitalCallModal
          projectUuid={projectUuid}
          capTable={capTable}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </section>
  );
}

// ─── Per-call card ──────────────────────────────────────────────────────────

function CapitalCallCard({ call, isAdmin }: { call: CapitalCallView; isAdmin: boolean }) {
  const router = useRouter();
  const [paymentForShareId, setPaymentForShareId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const totalPaidCents = call.shares.reduce((s, sh) => s + sh.paidCents, 0);
  const pct = call.totalAmountCents > 0 ? totalPaidCents / call.totalAmountCents : 0;
  const anyPayments = call.shares.some((s) => s.paidCents > 0);

  function handleCancel() {
    if (!confirm(`Cancel ${call.callNumber}? This soft-deletes the call.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/capital-calls/${call.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message: string } } | null;
        setError(body?.error?.message ?? `Cancel failed (HTTP ${res.status})`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <article
      style={{
        background: 'var(--color-surface-base)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 12,
        padding: 16,
        opacity: call.isArchived ? 0.55 : 1,
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <code
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--color-text-primary)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {call.callNumber}
            </code>
            <StatusPill status={call.status} />
            {call.isArchived && (
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>archived</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            Issued {call.issuedDate ?? '—'} · Due {call.dueDate ?? '—'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatMoney(call.totalAmountCents, { compact: true, precision: 2 })}
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--color-text-tertiary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatMoney(totalPaidCents, { compact: true, precision: 2 })} funded (
            {(pct * 100).toFixed(0)}%)
          </div>
        </div>
      </header>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <Th align="left">Owner</Th>
            <Th align="right">Share</Th>
            <Th align="right">Amount</Th>
            <Th align="right">Paid</Th>
            <Th align="left">Status</Th>
            {isAdmin && <Th align="right">Actions</Th>}
          </tr>
        </thead>
        <tbody>
          {call.shares.map((s) => (
            <ShareRow
              key={s.id}
              share={s}
              isAdmin={isAdmin}
              canRecordPayment={!call.isArchived && call.status !== 'cancelled'}
              onRecordPayment={() => setPaymentForShareId(s.id)}
            />
          ))}
        </tbody>
      </table>

      {paymentForShareId && (
        <RecordPaymentForm
          callId={call.id}
          share={call.shares.find((s) => s.id === paymentForShareId)!}
          onClose={() => setPaymentForShareId(null)}
        />
      )}

      {error && (
        <p
          role="alert"
          style={{
            margin: '12px 0 0 0',
            fontSize: 12,
            color: 'var(--color-negative, #dc2626)',
          }}
        >
          {error}
        </p>
      )}

      {isAdmin && !call.isArchived && (
        <footer
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid var(--color-border-subtle)',
            gap: 8,
          }}
        >
          {anyPayments ? (
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Cancel disabled — call has recorded payments
            </span>
          ) : (
            <Button variant="ghost" size="sm" onClick={handleCancel} loading={isPending}>
              Cancel call
            </Button>
          )}
        </footer>
      )}
    </article>
  );
}

function ShareRow({
  share,
  isAdmin,
  canRecordPayment,
  onRecordPayment,
}: {
  share: CapitalCallView['shares'][number];
  isAdmin: boolean;
  canRecordPayment: boolean;
  onRecordPayment: () => void;
}) {
  return (
    <tr>
      <Td>{share.ownerName}</Td>
      <Td muted>{(share.shareBpsAtIssuance / 100).toFixed(2)}%</Td>
      <TdMoney cents={share.shareAmountCents} />
      <TdMoney cents={share.paidCents} muted={share.paidCents === 0} />
      <Td>
        <ShareStatusBadge status={share.status} />
      </Td>
      {isAdmin && (
        <td style={{ padding: '6px 0', textAlign: 'right' }}>
          {canRecordPayment && share.status !== 'funded' ? (
            <Button variant="ghost" size="sm" onClick={onRecordPayment}>
              Record payment
            </Button>
          ) : null}
        </td>
      )}
    </tr>
  );
}

// ─── Status pills ───────────────────────────────────────────────────────────

const CALL_STATUS_COLOR: Record<string, string> = {
  draft: 'var(--color-text-tertiary)',
  issued: 'var(--color-status-info, #2563eb)',
  partial: 'var(--color-status-warning, #d97706)',
  funded: 'var(--color-positive, #16a34a)',
  cancelled: 'var(--color-negative, #dc2626)',
};

function StatusPill({ status }: { status: string }) {
  const color = CALL_STATUS_COLOR[status] ?? 'var(--color-text-tertiary)';
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        padding: '2px 8px',
        borderRadius: 999,
        border: `1px solid ${color}`,
        color,
      }}
    >
      {status}
    </span>
  );
}

function ShareStatusBadge({ status }: { status: OwnerShareStatus }) {
  const color =
    status === 'funded'
      ? 'var(--color-positive, #16a34a)'
      : status === 'committed'
        ? 'var(--color-status-info, #2563eb)'
        : 'var(--color-text-tertiary)';
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 400,
        color,
      }}
    >
      {status}
    </span>
  );
}

// ─── Cells ──────────────────────────────────────────────────────────────────

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

function TdMoney({ cents, muted = false }: { cents: number; muted?: boolean }) {
  return (
    <td
      style={{
        padding: '8px 0',
        textAlign: 'right',
        fontSize: 13,
        fontVariantNumeric: 'tabular-nums',
        color: muted ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
        borderBottom: '1px solid var(--color-border-subtle)',
      }}
    >
      {cents === 0 ? '—' : formatMoney(cents, { compact: false, precision: 0 })}
    </td>
  );
}
