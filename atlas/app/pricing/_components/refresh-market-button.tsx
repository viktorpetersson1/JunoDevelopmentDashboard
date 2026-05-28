'use client';

/**
 * Refresh market data button.
 *
 * Triggers POST /api/pricing/market-research, which fans out an AI comp-
 * sampling call across every sub-cut in the East End market and auto-saves
 * results to atlas.comps. Wall-clock 25-35 seconds. The button shows a
 * progress message during the call and refreshes the page on completion.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

interface ResearchResult {
  subCutsResearched: number;
  totalCompsFound: number;
  totalInserted: number;
  totalSkipped: number;
}

export function RefreshMarketButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error' | null>(null);

  const onClick = useCallback(async () => {
    setPending(true);
    setFeedback(null);
    setFeedbackTone(null);
    try {
      const res = await fetch('/api/pricing/market-research', { method: 'POST' });
      const json = (await res.json()) as
        | { data: ResearchResult }
        | { error: { message: string } };
      if (!res.ok || 'error' in json) {
        const msg = 'error' in json ? json.error.message : `HTTP ${res.status}`;
        setFeedback(`Refresh failed: ${msg}`);
        setFeedbackTone('error');
        return;
      }
      const { totalInserted, totalSkipped, subCutsResearched, totalCompsFound } =
        json.data;
      setFeedback(
        `Researched ${subCutsResearched} sub-cuts · found ${totalCompsFound} comps · added ${totalInserted} new${totalSkipped > 0 ? ` (${totalSkipped} already in library)` : ''}.`
      );
      setFeedbackTone('success');
      router.refresh();
    } catch (e) {
      setFeedback(
        `Refresh failed: ${e instanceof Error ? e.message : 'unknown error'}`
      );
      setFeedbackTone('error');
    } finally {
      setPending(false);
    }
  }, [router]);

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        style={{
          fontSize: 12,
          fontWeight: 500,
          padding: '6px 12px',
          borderRadius: 8,
          border: '1px solid var(--color-border-hairline, #c8c8c5)',
          background: pending
            ? 'var(--color-surface-sunken, #fafaf8)'
            : 'var(--color-surface-base, #fff)',
          color: 'var(--color-text-primary, #111)',
          cursor: pending ? 'wait' : 'pointer',
        }}
      >
        {pending ? 'Researching… (~30s)' : 'Refresh market data'}
      </button>
      {feedback && (
        <span
          style={{
            fontSize: 11,
            color:
              feedbackTone === 'error'
                ? 'var(--color-negative, #b91c1c)'
                : 'var(--color-positive, #15803d)',
          }}
        >
          {feedback}
        </span>
      )}
    </div>
  );
}
