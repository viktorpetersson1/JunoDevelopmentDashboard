'use client';

/**
 * Inline payment-entry form rendered below a capital-call card when the
 * admin clicks "Record payment". POSTs /api/capital-calls/[id]/payments.
 *
 * Validates against share.shareAmountCents - share.paidCents so the form
 * can't request more than the remaining balance.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { formatMoney } from '@/lib/utils/money';
import type { CapitalCallShareView } from '@/lib/repos/capital-call';

export function RecordPaymentForm({
  callId,
  share,
  onClose,
}: {
  callId: string;
  share: CapitalCallShareView;
  onClose: () => void;
}) {
  const router = useRouter();
  const remainingCents = Math.max(0, share.shareAmountCents - share.paidCents);
  const [amountDollars, setAmountDollars] = useState<string>((remainingCents / 100).toString());
  const [receivedDate, setReceivedDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<string>('');
  const [reference, setReference] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  const amountCents = Math.round((Number.parseFloat(amountDollars) || 0) * 100);
  const valid = amountCents > 0 && amountCents <= remainingCents && receivedDate.length === 10;

  function submit() {
    if (!valid) {
      if (amountCents > remainingCents) {
        setError(`Amount exceeds remaining (${formatMoney(remainingCents, { precision: 2 })})`);
      } else if (amountCents <= 0) {
        setError('Amount must be > 0');
      } else if (!receivedDate) {
        setError('Pick a received date');
      }
      return;
    }
    setError(null);
    startSubmit(async () => {
      const res = await fetch(`/api/capital-calls/${callId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerShareId: share.id,
          amountCents,
          receivedDate,
          method: method || null,
          referenceNumber: reference || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message: string } } | null;
        setError(body?.error?.message ?? `Save failed (HTTP ${res.status})`);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <section
      style={{
        marginTop: 12,
        padding: 12,
        background: 'var(--color-surface-sunken)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 8,
      }}
    >
      <header
        style={{
          marginBottom: 8,
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--color-text-primary)',
        }}
      >
        Record payment from {share.ownerName} ·{' '}
        <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)' }}>
          remaining {formatMoney(remainingCents, { precision: 2 })}
        </span>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
        <Input
          label="Amount (USD)"
          type="number"
          value={amountDollars}
          onChange={setAmountDollars}
        />
        <Input label="Received" type="date" value={receivedDate} onChange={setReceivedDate} />
        <Input
          label="Method"
          type="text"
          value={method}
          onChange={setMethod}
          placeholder="wire / check"
        />
        <Input
          label="Reference"
          type="text"
          value={reference}
          onChange={setReference}
          placeholder="bank ref #"
        />
      </div>
      {error && (
        <p
          role="alert"
          style={{ margin: '8px 0 0 0', fontSize: 11, color: 'var(--color-negative, #dc2626)' }}
        >
          {error}
        </p>
      )}
      <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={submit}
          loading={isSubmitting}
          disabled={!valid}
        >
          Record payment
        </Button>
      </footer>
    </section>
  );
}

function Input({
  label,
  type,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type: 'text' | 'number' | 'date';
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        fontSize: 11,
        color: 'var(--color-text-tertiary)',
      }}
    >
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '6px 10px',
          fontSize: 13,
          border: '1px solid var(--color-border-hairline)',
          borderRadius: 6,
          background: 'var(--color-surface-base)',
          color: 'var(--color-text-primary)',
          boxSizing: 'border-box',
        }}
      />
    </label>
  );
}
