'use client';

/**
 * V7 T144 — slim suggestions review panel on Home (#suggestions).
 *
 * The parked /suggestions page stays parked — this is the lightweight
 * resurrection the doc asks for: pending items with their evidence quote and
 * Approve / Reject. Approve routes through the T144 generic apply path
 * (PATCH /api/suggestions/[id] {status:'approved'} → server applies →
 * applied). Large numeric changes carry a flag. Editor+ only (server gates
 * the render).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import type { ProposedPatch } from '@/lib/agent/meeting-review';

export interface PendingSuggestionItem {
  id: string;
  submittedAt: string;
  prompt: string;
  assistantSummary: string | null;
  /** Structured T144 patch when present; legacy free-form otherwise. */
  patch: ProposedPatch | null;
}

export function SuggestionsReviewPanel({ items }: { items: PendingSuggestionItem[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const act = async (id: string, status: 'approved' | 'rejected') => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/suggestions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const body = (await res.json().catch(() => null)) as {
        data?: { applyNote?: string | null };
        error?: { message?: string };
      } | null;
      if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      if (status === 'approved' && body?.data?.applyNote) {
        setNotes((n) => ({ ...n, [id]: body.data!.applyNote! }));
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  if (items.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
        No suggestions waiting for review.
      </p>
    );
  }

  return (
    <div>
      {error && (
        <p
          role="alert"
          style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--color-negative, #b91c1c)' }}
        >
          {error}
        </p>
      )}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((s, i) => (
          <li
            key={s.id}
            style={{
              padding: '12px 0',
              borderBottom:
                i === items.length - 1 ? 'none' : '1px solid var(--color-border-subtle)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>
                  {s.prompt}
                </div>
                {s.patch ? (
                  <>
                    <div
                      style={{
                        fontSize: 13.5,
                        color: 'var(--color-text-primary)',
                        fontWeight: 600,
                      }}
                    >
                      {s.patch.entity} · {s.patch.id} · {s.patch.field}:{' '}
                      <span
                        style={{
                          color: 'var(--color-text-tertiary)',
                          textDecoration: 'line-through',
                        }}
                      >
                        {JSON.stringify(s.patch.current_value)}
                      </span>{' '}
                      → {JSON.stringify(s.patch.proposed_value)}
                      {s.patch.large_change && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            padding: '2px 8px',
                            borderRadius: 999,
                            border: '1px solid var(--color-warning, #a16207)',
                            color: 'var(--color-warning, #a16207)',
                          }}
                        >
                          Large change
                        </span>
                      )}
                    </div>
                    <blockquote
                      style={{
                        margin: '6px 0 0',
                        padding: '4px 10px',
                        borderLeft: '2px solid var(--color-border-hairline)',
                        fontSize: 12.5,
                        color: 'var(--color-text-secondary)',
                        fontStyle: 'italic',
                      }}
                    >
                      “{s.patch.evidence.quote}”
                      {s.patch.evidence.timestamp ? ` — ${s.patch.evidence.timestamp}` : ''}
                    </blockquote>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
                    {s.assistantSummary ?? '(free-form suggestion — approve does not auto-apply)'}
                  </div>
                )}
                {notes[s.id] && (
                  <p
                    style={{
                      margin: '6px 0 0',
                      fontSize: 12,
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {notes[s.id]}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => act(s.id, 'approved')}
                  loading={busyId === s.id}
                >
                  Approve
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => act(s.id, 'rejected')}
                  disabled={busyId === s.id}
                >
                  Reject
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
