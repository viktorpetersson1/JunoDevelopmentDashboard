'use client';

/**
 * V7 T140 — Research area: freeform notes, link list, decision log.
 *
 * Stored as jsonb on the opportunity row; every save PATCHes the whole
 * research object through /api/opportunities/[id] (editor+; the route makes
 * promoted records read-only). Notes render as pre-wrap plain text — the
 * app's existing convention (Rule 3: no rich-text/markdown deps).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import type { OpportunityResearch } from '@/lib/repos/opportunities';

export function ResearchPanel({
  opportunityId,
  research,
  readOnly,
}: {
  opportunityId: string;
  research: OpportunityResearch;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [notes, setNotes] = useState(research.notes_md ?? '');
  const [editingNotes, setEditingNotes] = useState(false);
  const [links, setLinks] = useState(research.links ?? []);
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [log, setLog] = useState(research.decision_log ?? []);
  const [newLogNote, setNewLogNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persist = async (next: OpportunityResearch) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ research: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      startTransition(() => router.refresh());
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const currentResearch = (): OpportunityResearch => ({
    notes_md: notes,
    links,
    decision_log: log,
  });

  const saveNotes = async () => {
    if (await persist({ ...currentResearch(), notes_md: notes })) setEditingNotes(false);
  };

  const addLink = async () => {
    if (!newLinkLabel.trim() || !newLinkUrl.trim()) return;
    const next = [...links, { label: newLinkLabel.trim(), url: newLinkUrl.trim() }];
    if (await persist({ ...currentResearch(), links: next })) {
      setLinks(next);
      setNewLinkLabel('');
      setNewLinkUrl('');
    }
  };

  const removeLink = async (idx: number) => {
    const next = links.filter((_, i) => i !== idx);
    if (await persist({ ...currentResearch(), links: next })) setLinks(next);
  };

  const addLogEntry = async () => {
    // QA fix: the Enter-key shortcut bypassed the Button's loading guard —
    // a persist racing an in-flight one could PATCH a stale research object
    // and silently drop the other change. Same gate as the buttons.
    if (saving) return;
    if (!newLogNote.trim()) return;
    const today = new Date().toISOString().slice(0, 10);
    const next = [...log, { date: today, note: newLogNote.trim() }];
    if (await persist({ ...currentResearch(), decision_log: next })) {
      setLog(next);
      setNewLogNote('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <header>
        <h2
          style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}
        >
          Research
        </h2>
        {readOnly && (
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Read-only{' '}
          </p>
        )}
      </header>

      {error && (
        <div role="alert" style={{ fontSize: 12.5, color: 'var(--color-negative, #b91c1c)' }}>
          {error}
        </div>
      )}

      {/* Notes */}
      <div>
        <SubHead
          label="Notes"
          action={
            !readOnly &&
            (editingNotes ? (
              <Button variant="primary" size="sm" onClick={saveNotes} loading={saving}>
                Save notes
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setEditingNotes(true)}>
                Edit
              </Button>
            ))
          }
        />
        {editingNotes ? (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={10}
            style={{
              width: '100%',
              padding: 10,
              fontSize: 13,
              fontFamily: 'inherit',
              borderRadius: 8,
              border: '1px solid var(--color-border-hairline)',
              background: 'var(--color-surface-base)',
              color: 'var(--color-text-primary)',
              resize: 'vertical',
            }}
            placeholder="Freeform research notes — comps, county records, structure ideas…"
          />
        ) : notes.trim() ? (
          <div
            style={{
              whiteSpace: 'pre-wrap',
              fontSize: 13,
              lineHeight: 1.55,
              color: 'var(--color-text-primary)',
            }}
          >
            {notes}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
            No notes yet.
          </p>
        )}
      </div>

      {/* Links */}
      <div>
        <SubHead label={`Links (${links.length})`} />
        {links.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
            No links yet — listings, comps, county records, Melissa&apos;s model.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {links.map((l, i) => (
              <li
                key={`${l.url}-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 0',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  fontSize: 13,
                }}
              >
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  style={{ color: 'var(--color-text-primary)', flex: 1 }}
                >
                  {l.label}
                </a>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--color-text-tertiary)',
                    maxWidth: 320,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {l.url}
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeLink(i)}
                    disabled={saving}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: 'var(--color-text-tertiary)',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                    aria-label={`Remove link ${l.label}`}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!readOnly && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <input
              style={{ ...inp, flex: '1 1 140px' }}
              placeholder="Label"
              value={newLinkLabel}
              onChange={(e) => setNewLinkLabel(e.target.value)}
            />
            <input
              style={{ ...inp, flex: '2 1 240px' }}
              placeholder="https://…"
              value={newLinkUrl}
              onChange={(e) => setNewLinkUrl(e.target.value)}
            />
            <Button variant="secondary" size="sm" onClick={addLink} loading={saving}>
              Add link
            </Button>
          </div>
        )}
      </div>

      {/* Decision log */}
      <div>
        <SubHead label={`Decision log (${log.length})`} />
        {log.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
            No decisions logged — dated one-liners land here.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {[...log].reverse().map((e, i) => (
              <li
                key={`${e.date}-${i}`}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '6px 0',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  fontSize: 13,
                }}
              >
                <span
                  style={{
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--color-text-tertiary)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {e.date}
                </span>
                <span style={{ color: 'var(--color-text-primary)' }}>{e.note}</span>
              </li>
            ))}
          </ul>
        )}
        {!readOnly && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input
              style={{ ...inp, flex: 1 }}
              placeholder={'e.g. "Siegel open to contract-now/close-later"'}
              value={newLogNote}
              onChange={(e) => setNewLogNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addLogEntry();
              }}
            />
            <Button variant="secondary" size="sm" onClick={addLogEntry} loading={saving}>
              Log
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function SubHead({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-tertiary)',
        }}
      >
        {label}
      </div>
      {action}
    </div>
  );
}

const inp: React.CSSProperties = {
  padding: '7px 9px',
  fontSize: 12.5,
  borderRadius: 7,
  border: '1px solid var(--color-border-hairline)',
  background: 'var(--color-surface-base)',
  color: 'var(--color-text-primary)',
};
