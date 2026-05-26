'use client';

/**
 * Actuals tab — entries list + admin "Add entry" modal.
 *
 * Server passes the grouped data already computed; this client component
 * just renders the entry list with a category-grouped table and (for
 * editors+) the add-entry modal trigger.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { formatMoney } from '@/lib/utils/money';
import type { ActualsByCategory } from '@/lib/services/actuals';
import type { ActualsCategory, ActualsEntryView } from '@/lib/repos/actuals';

const CATEGORY_LABELS: Record<ActualsCategory, string> = {
  land: 'Land',
  build: 'Build',
  soft: 'Soft costs',
  kingshaus: 'Kingshaus',
  financing: 'Financing',
  other: 'Other',
};

export function ActualsClient({
  projectKey,
  projectUuid,
  byCategory,
  isEditor,
}: {
  projectKey: string;
  projectUuid: string | null;
  byCategory: ActualsByCategory[];
  isEditor: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const flatEntries = useMemo(
    () => byCategory.flatMap((g) => g.entries),
    [byCategory]
  );

  return (
    <section
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 14,
        padding: 24,
        overflowX: 'auto',
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
              fontWeight: 600,
              margin: 0,
              color: 'var(--color-text-primary)',
            }}
          >
            Entries
          </h2>
          <p
            style={{
              margin: '2px 0 0 0',
              fontSize: 12,
              color: 'var(--color-text-tertiary)',
            }}
          >
            {flatEntries.length} {flatEntries.length === 1 ? 'invoice / line item' : 'invoices / line items'}
          </p>
        </div>
        {isEditor && projectUuid && (
          <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
            + Add entry
          </Button>
        )}
      </header>

      {flatEntries.length === 0 ? (
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
          No actuals recorded yet.{' '}
          {isEditor
            ? 'Add an entry to start tracking plan vs actual.'
            : 'An admin will add entries as invoices land.'}
        </div>
      ) : (
        <table className="ja-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <Th align="left">Date</Th>
              <Th align="left">Category</Th>
              <Th align="left">Line item</Th>
              <Th align="left">Vendor</Th>
              <Th align="left">Invoice</Th>
              <Th align="right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            {flatEntries.map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </tbody>
        </table>
      )}

      {addOpen && projectUuid && (
        <AddEntryModal
          projectKey={projectKey}
          projectUuid={projectUuid}
          onClose={() => setAddOpen(false)}
        />
      )}
    </section>
  );
}

function EntryRow({ entry }: { entry: ActualsEntryView }) {
  return (
    <tr>
      <Td muted>{entry.entryDate}</Td>
      <Td>
        <span
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-text-secondary)',
          }}
        >
          {CATEGORY_LABELS[entry.category]}
        </span>
      </Td>
      <Td>{entry.lineItem}</Td>
      <Td muted>{entry.vendor ?? '—'}</Td>
      <Td muted>
        {entry.invoiceRef ? (
          <code style={{ fontSize: 12 }}>{entry.invoiceRef}</code>
        ) : (
          '—'
        )}
      </Td>
      <td
        style={{
          padding: '8px 0',
          fontSize: 13,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--color-text-primary)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        {formatMoney(entry.amountCents, { precision: 2 })}
      </td>
    </tr>
  );
}

function AddEntryModal({
  projectKey,
  projectUuid,
  onClose,
}: {
  projectKey: string;
  projectUuid: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<ActualsCategory>('build');
  const [lineItem, setLineItem] = useState('');
  const [amountDollars, setAmountDollars] = useState('');
  const [vendor, setVendor] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  const amountCents = Math.round((Number.parseFloat(amountDollars) || 0) * 100);
  const valid = lineItem.trim().length > 0 && amountCents > 0 && entryDate.length === 10;

  function submit() {
    if (!valid) {
      setError(
        amountCents <= 0
          ? 'Amount must be > 0'
          : lineItem.trim().length === 0
            ? 'Line item is required'
            : 'Pick an entry date'
      );
      return;
    }
    setError(null);
    startSubmit(async () => {
      const res = await fetch(`/api/projects/${projectKey}/actuals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projectUuid,
          entryDate,
          category,
          lineItem: lineItem.trim(),
          amountCents,
          vendor: vendor.trim() || null,
          invoiceRef: invoiceRef.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message: string } }
          | null;
        setError(body?.error?.message ?? `Save failed (HTTP ${res.status})`);
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
      aria-label="Add actuals entry"
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
          maxWidth: 560,
          padding: 24,
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 16 }}>
          New actuals entry
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Date">
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ActualsCategory)}
              style={inputStyle}
            >
              {(Object.keys(CATEGORY_LABELS) as ActualsCategory[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Line item" full>
            <input
              type="text"
              value={lineItem}
              onChange={(e) => setLineItem(e.target.value)}
              placeholder="e.g. Foundation pour, Permit fees"
              style={inputStyle}
            />
          </Field>
          <Field label="Amount (USD)">
            <input
              type="number"
              value={amountDollars}
              onChange={(e) => setAmountDollars(e.target.value)}
              min={0}
              step={0.01}
              placeholder="e.g. 12500"
              style={inputStyle}
            />
          </Field>
          <Field label="Vendor">
            <input
              type="text"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="e.g. ABC Concrete"
              style={inputStyle}
            />
          </Field>
          <Field label="Invoice ref" full>
            <input
              type="text"
              value={invoiceRef}
              onChange={(e) => setInvoiceRef(e.target.value)}
              placeholder="bank/AP reference"
              style={inputStyle}
            />
          </Field>
          <Field label="Notes" full>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional context"
              style={inputStyle}
            />
          </Field>
        </div>
        {error && (
          <p
            role="alert"
            style={{ margin: '12px 0 0 0', fontSize: 12, color: 'var(--color-negative, #dc2626)' }}
          >
            {error}
          </p>
        )}
        <footer
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 16,
            paddingTop: 12,
            borderTop: '1px solid var(--color-border-subtle)',
          }}
        >
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={isSubmitting} disabled={!valid}>
            Save entry
          </Button>
        </footer>
      </div>
    </div>
  );
}

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

function Field({
  label,
  children,
  full = false,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        fontSize: 12,
        color: 'var(--color-text-secondary)',
        gridColumn: full ? '1 / -1' : undefined,
      }}
    >
      {label}
      {children}
    </label>
  );
}

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
