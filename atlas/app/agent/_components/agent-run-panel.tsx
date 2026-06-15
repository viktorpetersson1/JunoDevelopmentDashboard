'use client';

/**
 * Ask Juno v2 — run console (Phase B UI; read-only core).
 *
 * Built from the Atlas design language already shipped on the pricing tab:
 * surface-raised + hairline cards, #131313 primary CTA, ghost secondary,
 * quiet 6–7px status dots, Geist + tabular-nums, sentence case. The agent's
 * process IS the UI — a persistent status bar, a plan timeline whose dots move
 * pending → running → done, a sunken answer reader, and a calm soft-ceiling bar.
 *
 * Durable: the run id is persisted to localStorage; on mount/refresh the panel
 * replays /events and resumes driving — the replayed transcript renders through
 * the same components, so it looks identical to live. Drive loop re-advances on
 * `yield` and stops on done/paused/error/locked.
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
interface RecentRun {
  id: string;
  goal: string;
  status: string;
  costSpentUsd: number;
  createdAt: string;
}
interface AgentEvent {
  type: string;
  [k: string]: unknown;
}

// ── Atlas tokens (match the pricing-tab standard) ─────────────────────────────
const DOT: Record<string, string> = {
  pending: 'var(--color-text-quaternary, #b0b5bc)',
  running: 'var(--color-info, #1e40af)',
  done: 'var(--color-positive, #15803d)',
  failed: 'var(--color-negative, #b91c1c)',
  paused: 'var(--color-warning, #a16207)',
};
const CARD: React.CSSProperties = {
  background: 'var(--color-surface-raised, #fff)',
  border: '1px solid var(--color-border-hairline, #c8c8c5)',
  borderRadius: 'var(--ja-card-radius, 12px)',
  padding: 20,
};
const CTA: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  padding: '10px 18px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--color-accent-base, #131313)',
  color: '#fff',
  cursor: 'pointer',
};
const GHOST: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 400,
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid var(--color-border-hairline, #c8c8c5)',
  background: 'var(--color-surface-base, #fff)',
  color: 'var(--color-text-primary, #111)',
  cursor: 'pointer',
};
const EYEBROW: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--color-text-tertiary, #767b84)',
};
const MONO: React.CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--color-text-tertiary, #767b84)',
  fontSize: 12,
};

function Dot({ kind, size = 7 }: { kind: keyof typeof DOT; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, borderRadius: 999, background: DOT[kind], flex: '0 0 auto' }}
    />
  );
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
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

export function AgentRunPanel() {
  const [goal, setGoal] = useState('');
  const [activeGoal, setActiveGoal] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [planSummary, setPlanSummary] = useState('');
  const [steps, setSteps] = useState<Map<number, StepRow>>(new Map());
  const [answer, setAnswer] = useState('');
  const [pauseReason, setPauseReason] = useState('');
  const [cost, setCost] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [recent, setRecent] = useState<RecentRun[]>([]);
  const [showSteps, setShowSteps] = useState(false);
  const statusRef = useRef(status);
  statusRef.current = status;

  const resetTranscript = useCallback(() => {
    setStatus('');
    setActiveGoal('');
    setPlanSummary('');
    setSteps(new Map());
    setAnswer('');
    setPauseReason('');
    setCost(0);
    setNote('');
    setShowSteps(false);
  }, []);

  const applyEvent = useCallback((e: AgentEvent) => {
    switch (e.type) {
      case 'run':
        setStatus(String(e.status));
        setCost(Number(e.costSpent ?? 0));
        if (e.goal) setActiveGoal(String(e.goal));
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
  const driveRef = useRef(drive);
  driveRef.current = drive;

  const loadRecent = useCallback(async () => {
    try {
      const res = await fetch('/api/agent/runs');
      if (!res.ok) return;
      const json = (await res.json()) as { data?: { runs?: RecentRun[] } };
      setRecent((json.data?.runs ?? []).slice(0, 5));
    } catch {
      /* non-fatal */
    }
  }, []);

  // Resume on mount: replay durable state, then continue driving if still active.
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    void loadRecent();
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
      if (statusRef.current === 'running' || statusRef.current === 'planning') void driveRef.current();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRun = useCallback(
    async (goalArg?: string) => {
      const g = (goalArg ?? goal).trim();
      if (!g) return;
      setBusy(true);
      resetTranscript();
      setActiveGoal(g);
      try {
        const res = await fetch('/api/agent/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goal: g, pathname: window.location.pathname }),
        });
        const json = (await res.json().catch(() => null)) as
          | { data?: { run?: { id: string } }; error?: { message: string } }
          | null;
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
    },
    [goal, resetTranscript]
  );

  // Kick off driving once a freshly-created run id is set.
  useEffect(() => {
    if (runId && status === 'planning' && !busy && steps.size === 0 && !answer) void drive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const openRun = useCallback(
    async (id: string) => {
      resetTranscript();
      setRunId(id);
      localStorage.setItem(LS_KEY, id);
      const res = await fetch(`/api/agent/runs/${id}/events`);
      if (res.ok) {
        await consumeSse(res, applyEvent);
        if (statusRef.current === 'running' || statusRef.current === 'planning') void driveRef.current();
      }
    },
    [resetTranscript, applyEvent]
  );

  const newRun = useCallback(() => {
    localStorage.removeItem(LS_KEY);
    setRunId(null);
    setGoal('');
    resetTranscript();
    void loadRecent();
  }, [resetTranscript, loadRecent]);

  const abort = useCallback(async () => {
    if (!runId) return;
    await fetch(`/api/agent/runs/${runId}/abort`, { method: 'POST' }).catch(() => {});
    setStatus('aborted');
  }, [runId]);

  const stepList = Array.from(steps.values()).sort((a, b) => a.idx - b.idx);
  const total = stepList.length;
  const doneCount = stepList.filter((s) => s.state === 'done').length;
  const statusKind: keyof typeof DOT =
    status === 'completed'
      ? 'done'
      : status === 'failed' || status === 'error' || status === 'aborted'
        ? 'failed'
        : status === 'paused'
          ? 'paused'
          : 'running';
  const isTerminal = status === 'completed' || status === 'failed' || status === 'aborted' || status === 'error';
  const isActive = busy || status === 'running' || status === 'planning';
  const stepLabel = (s: StepRow) => (s.type === 'synthesize' ? 'Synthesise answer' : (s.tool ?? s.type));

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!runId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 760 }}>
        <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={EYEBROW}>New analysis</span>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void startRun();
            }}
            placeholder="Ask Juno to analyse the portfolio, a project, or pricing — e.g. “Summarise the portfolio KPIs and flag the thinnest-margin project.”"
            rows={3}
            style={{
              fontSize: 14,
              lineHeight: 1.5,
              padding: '10px 12px',
              border: '1px solid var(--color-border-hairline, #c8c8c5)',
              borderRadius: 8,
              resize: 'vertical',
              fontFamily: 'inherit',
              color: 'var(--color-text-primary, #111)',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary, #767b84)' }}>
              Read-only · plans, runs tools, and synthesises an answer.
            </span>
            <button
              type="button"
              onClick={() => void startRun()}
              disabled={busy || !goal.trim()}
              style={{ ...CTA, opacity: busy || !goal.trim() ? 0.6 : 1 }}
            >
              {busy ? 'Starting…' : 'Run'}
            </button>
          </div>
          {note && <p style={{ margin: 0, fontSize: 12, color: 'var(--color-negative, #b91c1c)' }}>{note}</p>}
        </div>

        {recent.length > 0 && (
          <div style={CARD}>
            <span style={EYEBROW}>Recent runs</span>
            <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
              {recent.map((r) => (
                <li
                  key={r.id}
                  style={{ borderTop: '1px solid var(--color-border-hairline, #c8c8c5)' }}
                >
                  <button
                    type="button"
                    onClick={() => void openRun(r.id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 2px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      font: 'inherit',
                    }}
                  >
                    <Dot
                      kind={
                        r.status === 'completed'
                          ? 'done'
                          : r.status === 'failed' || r.status === 'aborted'
                            ? 'failed'
                            : r.status === 'paused'
                              ? 'paused'
                              : 'running'
                      }
                    />
                    <span
                      style={{
                        flex: 1,
                        fontSize: 13,
                        color: 'var(--color-text-primary, #111)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {r.goal}
                    </span>
                    <span style={MONO}>
                      ${r.costSpentUsd.toFixed(2)} · {relTime(r.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // ── Run console ────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 760 }}>
      <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Status bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            paddingBottom: 12,
            borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)',
          }}
        >
          <Dot kind={statusKind} size={8} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary, #111)', textTransform: 'capitalize' }}>
            {status || 'planning'}
          </span>
          {total > 0 && <span style={MONO}>step {Math.min(doneCount + (isActive ? 1 : 0), total)}/{total}</span>}
          <span style={MONO}>· ${cost.toFixed(4)}</span>
          <span style={{ flex: 1 }} />
          {isActive && (
            <button type="button" onClick={() => void abort()} style={GHOST}>
              Stop
            </button>
          )}
          {status === 'failed' && (
            <button type="button" onClick={() => void startRun(activeGoal)} style={{ ...CTA, padding: '6px 14px', fontSize: 12 }}>
              Retry
            </button>
          )}
          <button type="button" onClick={newRun} style={GHOST}>
            New run
          </button>
        </div>

        {/* Goal */}
        {activeGoal && (
          <div>
            <span style={EYEBROW}>Goal</span>
            <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--color-text-primary, #111)', lineHeight: 1.5 }}>
              {activeGoal}
            </p>
          </div>
        )}

        {/* Plan timeline (collapsible once completed) */}
        {total > 0 && (
          <div>
            {status === 'completed' ? (
              <button
                type="button"
                onClick={() => setShowSteps((s) => !s)}
                style={{ ...EYEBROW, background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {showSteps ? 'Hide' : 'Show'} {total} steps
              </button>
            ) : (
              <>
                <span style={EYEBROW}>Plan</span>
                {planSummary && (
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--color-text-secondary, #6b7280)', lineHeight: 1.5 }}>
                    {planSummary}
                  </p>
                )}
              </>
            )}

            {(status !== 'completed' || showSteps) && (
              <ol style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {stepList.map((s) => (
                  <li key={s.idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13 }}>
                    <span style={{ marginTop: 5 }}>
                      <Dot kind={s.state === 'pending' ? 'pending' : s.state === 'running' ? 'running' : s.state === 'failed' ? 'failed' : 'done'} size={6} />
                    </span>
                    <span style={{ flex: 1 }}>
                      <span style={{ fontWeight: 500, color: 'var(--color-text-primary, #111)' }}>{stepLabel(s)}</span>
                      {s.state === 'running' && (
                        <span style={{ color: 'var(--color-text-tertiary, #767b84)' }}> · working…</span>
                      )}
                      {s.summary && s.type !== 'synthesize' && (
                        <span style={{ display: 'block', color: 'var(--color-text-tertiary, #767b84)', marginTop: 2, fontSize: 12 }}>
                          {s.summary}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {/* Paused — soft-ceiling continue affordance */}
        {status === 'paused' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              padding: '12px 14px',
              background: 'var(--color-warning-soft, #fefce8)',
              border: '1px solid var(--color-border-hairline, #c8c8c5)',
              borderRadius: 8,
            }}
          >
            <Dot kind="paused" />
            <span style={{ flex: 1, minWidth: 220, fontSize: 13, color: 'var(--color-text-secondary, #6b7280)' }}>
              {pauseReason.includes('hard')
                ? `Hard limit reached (${pauseReason.replace(/_/g, ' ')}). Start a new run to go further.`
                : `Reached the ${pauseReason.replace(/_/g, ' ')} checkpoint. Continue this run?`}
            </span>
            {!pauseReason.includes('hard') && (
              <button type="button" onClick={() => void drive(true)} disabled={busy} style={{ ...CTA, padding: '8px 16px', opacity: busy ? 0.6 : 1 }}>
                Continue
              </button>
            )}
          </div>
        )}

        {/* Answer */}
        {answer && (
          <div>
            <span style={EYEBROW}>Answer</span>
            <div
              style={{
                marginTop: 8,
                padding: 14,
                background: 'var(--color-surface-sunken, #fafaf8)',
                border: '1px solid var(--color-border-hairline, #c8c8c5)',
                borderRadius: 8,
                fontSize: 14,
                lineHeight: 1.6,
                color: 'var(--color-text-primary, #111)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {answer}
            </div>
          </div>
        )}

        {/* Failure / note */}
        {(status === 'failed' || status === 'error' || status === 'aborted') && note && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--color-text-secondary, #6b7280)' }}>
            <span style={{ marginTop: 5 }}>
              <Dot kind="failed" size={6} />
            </span>
            <span>{note}</span>
          </div>
        )}
        {!isTerminal && note && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary, #767b84)' }}>{note}</p>
        )}
      </div>
    </div>
  );
}
