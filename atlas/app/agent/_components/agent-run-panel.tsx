'use client';

/**
 * Ask Juno v2 — Phase 1 run panel (read-only core).
 *
 * Drives a durable run: POST /runs → POST /advance (consume SSE; re-advance on
 * `yield`). Persists the run id in localStorage and, on mount/refresh, replays
 * durable state via GET /events so a mid-run reload reconstructs the transcript
 * and resumes. Quiet dot + mono styling (Atlas standard).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const LS_KEY = 'atlas_agent_run_id';

type StepState = 'pending' | 'running' | 'done' | 'failed';
interface StepRow {
  idx: number;
  tool: string | null;
  type: string;
  state: StepState;
  summary?: string;
}
interface AgentEvent {
  type: string;
  [k: string]: unknown;
}

async function consumeSse(res: Response, onEvent: (e: AgentEvent) => void): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, nl);
      buf = buf.slice(nl + 2);
      const line = chunk.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()) as AgentEvent);
      } catch {
        /* ignore malformed frame */
      }
    }
  }
}

const DOT: Record<string, string> = {
  pending: 'var(--color-text-quaternary, #9aa0a6)',
  running: 'var(--color-info, #1e40af)',
  done: 'var(--color-positive, #15803d)',
  failed: 'var(--color-negative, #b91c1c)',
};

export function AgentRunPanel() {
  const [goal, setGoal] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [planSummary, setPlanSummary] = useState('');
  const [steps, setSteps] = useState<Map<number, StepRow>>(new Map());
  const [answer, setAnswer] = useState('');
  const [pauseReason, setPauseReason] = useState('');
  const [cost, setCost] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const statusRef = useRef(status);
  statusRef.current = status;

  const reset = useCallback(() => {
    setStatus('');
    setPlanSummary('');
    setSteps(new Map());
    setAnswer('');
    setPauseReason('');
    setCost(0);
    setNote('');
  }, []);

  const applyEvent = useCallback((e: AgentEvent) => {
    switch (e.type) {
      case 'run':
        setStatus(String(e.status));
        setCost(Number(e.costSpent ?? 0));
        break;
      case 'plan': {
        setPlanSummary(String(e.summary ?? ''));
        const incoming = (e.steps as Array<{ idx: number; tool: string | null; type: string }>) ?? [];
        setSteps(new Map(incoming.map((s) => [s.idx, { ...s, state: 'pending' as StepState }])));
        break;
      }
      case 'step_start':
        setSteps((m) => {
          const n = new Map(m);
          const cur = n.get(Number(e.idx));
          n.set(Number(e.idx), {
            idx: Number(e.idx),
            tool: (e.tool as string | null) ?? cur?.tool ?? null,
            type: String(e.stepType ?? cur?.type ?? ''),
            state: 'running',
          });
          return n;
        });
        break;
      case 'step_done':
        setSteps((m) => {
          const n = new Map(m);
          const cur = n.get(Number(e.idx));
          if (cur) n.set(Number(e.idx), { ...cur, state: 'done', summary: String(e.summary ?? '') });
          return n;
        });
        setCost(Number(e.costSpent ?? 0));
        break;
      case 'step_failed':
        setSteps((m) => {
          const n = new Map(m);
          const cur = n.get(Number(e.idx));
          if (cur) n.set(Number(e.idx), { ...cur, state: 'failed', summary: String(e.error ?? '') });
          return n;
        });
        setStatus('failed');
        break;
      case 'paused':
        setStatus('paused');
        setPauseReason(String(e.reason ?? ''));
        setCost(Number(e.costSpent ?? 0));
        break;
      case 'done':
        setStatus('completed');
        setAnswer(String(e.answer ?? ''));
        setCost(Number(e.costSpent ?? 0));
        break;
      case 'error':
        setStatus('error');
        setNote(String(e.message ?? 'error'));
        break;
      case 'locked':
        setNote('Another tab is advancing this run — showing its progress.');
        break;
    }
  }, []);

  const drive = useCallback(
    async (firstContinue = false) => {
      if (!runId) return;
      setBusy(true);
      try {
        let first = firstContinue;
        for (;;) {
          const res = await fetch(`/api/agent/runs/${runId}/advance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(first ? { continue: true } : {}),
          });
          first = false;
          let sawYield = false;
          let stop = false;
          await consumeSse(res, (e) => {
            applyEvent(e);
            if (e.type === 'yield') sawYield = true;
            if (e.type === 'done' || e.type === 'paused' || e.type === 'error' || e.type === 'locked') stop = true;
          });
          if (stop || !sawYield) break;
        }
      } catch (err) {
        setNote(err instanceof Error ? err.message : 'network error');
      } finally {
        setBusy(false);
      }
    },
    [runId, applyEvent]
  );

  // Resume on mount: replay durable state, then continue driving if still active.
  const driveRef = useRef(drive);
  driveRef.current = drive;
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    if (!saved) return;
    setRunId(saved);
    (async () => {
      const res = await fetch(`/api/agent/runs/${saved}/events`);
      if (!res.ok) {
        localStorage.removeItem(LS_KEY);
        setRunId(null);
        return;
      }
      await consumeSse(res, applyEvent);
      if (statusRef.current === 'running' || statusRef.current === 'planning') {
        void driveRef.current();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRun = useCallback(async () => {
    if (!goal.trim()) return;
    setBusy(true);
    reset();
    try {
      const res = await fetch('/api/agent/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: goal.trim(), pathname: window.location.pathname }),
      });
      const json = (await res.json().catch(() => null)) as { data?: { run?: { id: string } }; error?: { message: string } } | null;
      if (!res.ok || !json?.data?.run?.id) {
        setNote(json?.error?.message ?? `Failed to start (HTTP ${res.status})`);
        setBusy(false);
        return;
      }
      const id = json.data.run.id;
      localStorage.setItem(LS_KEY, id);
      setRunId(id);
      setStatus('planning');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'network error');
      setBusy(false);
    }
  }, [goal, reset]);

  // Kick off driving once a freshly-created run id is set.
  useEffect(() => {
    if (runId && status === 'planning' && !busy && steps.size === 0 && !answer) {
      void drive();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const newRun = useCallback(() => {
    localStorage.removeItem(LS_KEY);
    setRunId(null);
    setGoal('');
    reset();
  }, [reset]);

  const abort = useCallback(async () => {
    if (!runId) return;
    await fetch(`/api/agent/runs/${runId}/abort`, { method: 'POST' }).catch(() => {});
    setStatus('aborted');
  }, [runId]);

  const stepList = Array.from(steps.values()).sort((a, b) => a.idx - b.idx);
  const active = busy || status === 'running' || status === 'planning';

  const card: React.CSSProperties = {
    background: 'var(--color-surface-raised, #fff)',
    border: '1px solid var(--color-border-hairline, #c8c8c5)',
    borderRadius: 12,
    padding: 16,
  };
  const btn: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 400,
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid var(--color-border-hairline, #c8c8c5)',
    background: 'var(--color-surface-base, #fff)',
    color: 'var(--color-text-primary, #111)',
    cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 760 }}>
      {!runId && (
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Ask Juno to analyse something — e.g. 'Summarise the portfolio KPIs and flag the project with the thinnest margin.'"
            rows={3}
            style={{
              fontSize: 14,
              padding: '10px 12px',
              border: '1px solid var(--color-border-hairline, #c8c8c5)',
              borderRadius: 8,
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
          <div>
            <button type="button" onClick={startRun} disabled={busy || !goal.trim()} style={{ ...btn, opacity: busy || !goal.trim() ? 0.6 : 1 }}>
              {busy ? 'Starting…' : 'Run'}
            </button>
          </div>
        </div>
      )}

      {runId && (
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background:
                  status === 'completed'
                    ? DOT.done
                    : status === 'failed' || status === 'error' || status === 'aborted'
                      ? DOT.failed
                      : status === 'paused'
                        ? 'var(--color-warning, #a16207)'
                        : DOT.running,
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)' }}>
              {status || 'planning'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
              ${cost.toFixed(4)} spent
            </span>
            <span style={{ flex: 1 }} />
            {active && (
              <button type="button" onClick={abort} style={{ ...btn, padding: '4px 10px', fontSize: 12 }}>
                Stop
              </button>
            )}
            <button type="button" onClick={newRun} style={{ ...btn, padding: '4px 10px', fontSize: 12 }}>
              New run
            </button>
          </div>

          {planSummary && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{planSummary}</p>
          )}

          {stepList.length > 0 && (
            <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
              {stepList.map((s) => (
                <li key={s.idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
                  <span
                    aria-hidden
                    style={{ width: 6, height: 6, borderRadius: 999, marginTop: 6, background: DOT[s.state], flex: '0 0 auto' }}
                  />
                  <span>
                    <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>
                      {s.type === 'synthesize' ? 'Synthesise answer' : (s.tool ?? s.type)}
                    </span>
                    {s.summary && s.type !== 'synthesize' && (
                      <span style={{ color: 'var(--color-text-tertiary)' }}> — {s.summary}</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {status === 'paused' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--color-text-secondary)' }}>
              <span>
                Paused ({pauseReason.replace(/_/g, ' ')}).{' '}
                {pauseReason.includes('hard') ? 'Hard cap reached — start a new run to go further.' : ''}
              </span>
              {!pauseReason.includes('hard') && (
                <button type="button" onClick={() => drive(true)} disabled={busy} style={{ ...btn, padding: '6px 12px', fontSize: 12 }}>
                  Continue
                </button>
              )}
            </div>
          )}

          {answer && (
            <div
              style={{
                marginTop: 4,
                padding: 14,
                background: 'var(--color-surface-sunken, #f4f4f2)',
                border: '1px solid var(--color-border-hairline, #c8c8c5)',
                borderRadius: 8,
                fontSize: 14,
                lineHeight: 1.6,
                color: 'var(--color-text-primary)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {answer}
            </div>
          )}

          {note && <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>{note}</p>}
        </div>
      )}
    </div>
  );
}
