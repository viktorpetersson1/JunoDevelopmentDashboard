'use client';

/**
 * V7 T142 — "Sync meetings" on /agent (editor+; the page gates the role).
 *
 * One button → POST /api/meetings/sync → shows the refreshed list. No cron:
 * this is the only ingestion trigger. Errors surface verbatim (a missing
 * FATHOM_API_KEY must read as exactly that, not as "no meetings").
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import type { MeetingView } from '@/lib/repos/meetings';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function MeetingsSync({ meetings }: { meetings: MeetingView[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [reviewing, setReviewing] = useState(false);

  const sync = async () => {
    setSyncing(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/meetings/sync', { method: 'POST' });
      const body = (await res.json().catch(() => null)) as {
        data?: { fetched: number; upserted: number };
        error?: { message?: string };
      } | null;
      if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      setResult(
        `Fetched ${body?.data?.fetched ?? 0}, upserted ${body?.data?.upserted ?? 0}. Review the latest meeting to file fact-check suggestions.`
      );
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  };

  // V7 T144 — reads the newest meeting, compares vs Atlas, files PENDING
  // suggestions (never auto-applied; review them on Home).
  const review = async () => {
    setReviewing(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/agent/review-meeting', { method: 'POST' });
      const body = (await res.json().catch(() => null)) as {
        data?: { filed: number; rejected: string[]; meeting?: { title: string } };
        error?: { message?: string };
      } | null;
      if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      const filed = body?.data?.filed ?? 0;
      setResult(
        filed > 0
          ? `Filed ${filed} suggestion${filed === 1 ? '' : 's'} from "${body?.data?.meeting?.title}" — review them on Home.`
          : `No fact changes found in "${body?.data?.meeting?.title}".`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReviewing(false);
    }
  };

  return (
    <section
      style={{
        background: 'var(--ja-card-bg)',
        border: 'var(--ja-card-border)',
        borderRadius: 'var(--ja-card-radius)',
        padding: 'var(--ja-card-padding)',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 12,
          marginBottom: 10,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2
            style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}
          >
            Meetings
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Fathom recordings (Juno-titled or ≥3 participants, last 90 days). Ask Juno can read
            these.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {meetings.length > 0 && (
            <Button variant="secondary" size="sm" onClick={review} loading={reviewing}>
              Review latest meeting
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={sync} loading={syncing}>
            Sync meetings
          </Button>
        </div>
      </header>

      {result && (
        <p
          role="status"
          style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-text-secondary)' }}
        >
          {result}
        </p>
      )}
      {error && (
        <p
          role="alert"
          style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-negative, #b91c1c)' }}
        >
          {error}
        </p>
      )}

      {meetings.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
          No meetings ingested yet — Sync pulls the recent Juno calls from Fathom.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {meetings.map((m, i) => (
            <li
              key={m.id}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 10,
                padding: '7px 0',
                borderBottom:
                  i === meetings.length - 1 ? 'none' : '1px solid var(--color-border-subtle)',
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
                {fmtDate(m.heldAt)}
              </span>
              <span style={{ color: 'var(--color-text-primary)', flex: 1 }}>{m.title}</span>
              <span
                style={{ fontSize: 11, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}
              >
                {m.participants.length} people{m.transcriptMd ? ' · transcript' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
