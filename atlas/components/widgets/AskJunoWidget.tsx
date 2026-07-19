'use client';

/**
 * AJ-v3 — the Ask Juno WORKING PANE.
 *
 * A right-docked work surface (not a chat bubble): opens via the topbar
 * "Ask Juno" button or the `atlas:open-ask-juno` event, pushes the page
 * content left on wide screens, and drives the /api/ask-juno agentic loop:
 *
 *   - answers from live platform data (READ tools run inline)
 *   - carries out work: writes propose a confirmation card → Approve runs
 *     the change server-side (validated services + audit) and Juno KEEPS
 *     WORKING after the approval
 *   - asks clarifying questions as clickable multiple-choice options
 *     (ask_user protocol), with a free-text fallback
 *   - ingests .xlsx / .csv attachments (server-parsed) the model reads via
 *     read_attachment to apply figure updates
 *
 * Conversation persists in sessionStorage (survives navigation + refresh
 * within the session). Mounted once in app/providers.tsx.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { JunoMark } from '@/components/brand';
import { renderMarkdown } from '@/lib/ask-juno/markdown';

const PANE_WIDTH_DEFAULT = 440;
const PANE_WIDTH_MIN = 380;
const PANE_WIDTH_MAX = 720;
const WIDTH_KEY = 'aj-v4-pane-width'; // localStorage — a lasting preference
const SHIFT_MIN_VIEWPORT = 1180; // below this, overlay instead of pushing content
const STORAGE_KEY = 'aj-v3-conversation';
const HIDDEN_ON = ['/sign-in', '/sign-up'];
const HISTORY_SEND_CAP = 40;

/** AJ-v4 — contextual starter chips for the empty state. */
function starterChips(pathname: string): Array<{ label: string; prompt: string }> {
  if (/^\/projects\/[^/]+/.test(pathname)) {
    return [
      {
        label: 'Explain this project',
        prompt:
          'Give me the exec summary of the project I am viewing — economics, timeline, and open risks.',
      },
      {
        label: 'Update figures here',
        prompt: 'I want to update figures on this project.',
      },
      {
        label: 'Compare to the approved snapshot',
        prompt: 'How is this project tracking vs its latest approved snapshot?',
      },
    ];
  }
  if (pathname.startsWith('/pipeline')) {
    return [
      {
        label: 'Rank the pipeline',
        prompt: 'Rank the current pipeline opportunities by attractiveness and tell me why.',
      },
      { label: 'Add an opportunity', prompt: 'I want to add a new opportunity to the pipeline.' },
      {
        label: 'What moved recently?',
        prompt: 'What changed in the pipeline in the last 30 days?',
      },
    ];
  }
  return [
    {
      label: 'What needs my attention?',
      prompt:
        'What needs my attention today across the portfolio? Check pending suggestions, draft capital calls and snapshots, and anything unusual.',
    },
    {
      label: '90-day cash need',
      prompt: "What's our 90-day cash requirement and which projects drive it?",
    },
    {
      label: 'Update from a spreadsheet',
      prompt: 'I want to update platform figures from a spreadsheet.',
    },
    {
      label: 'Portfolio margins',
      prompt: 'Show margin by project as a table, best to worst.',
    },
  ];
}

// ── Message model ─────────────────────────────────────────────────────────────

interface ConfirmationCard {
  tool_name: string;
  tool_use_id: string;
  tool_args: Record<string, unknown>;
  reason: string;
  /** resolved: user acted on it (kept for transcript display). */
  resolved?: 'approved' | 'declined';
}

interface QuestionCard {
  tool_use_id: string;
  tool_args: Record<string, unknown>;
  question: string;
  options: Array<{ label: string; description?: string }>;
  /** The answer the user picked/typed, once resolved. */
  answered?: string;
}

interface ExecutedWrite {
  tool: string;
  audit_log_id: string | null;
  /** AJ-v4 — deep link to the entity the write touched (e.g. /projects/p12). */
  entity?: { href: string; label?: string } | null;
  /** AJ-v4 — set client-side once the receipt's Revert succeeded. */
  reverted?: boolean;
}

// AJ-v4 — batch plan card (propose_changes).
interface PlanChange {
  field: string;
  before: unknown;
  after: unknown;
}
interface PlanItemView {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  changes: PlanChange[];
}
interface PlanCard {
  tool_use_id: string;
  tool_args: Record<string, unknown>;
  title: string;
  items: PlanItemView[];
  resolved?: 'approved' | 'declined';
  approvedCount?: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool_status' | 'confirmation' | 'question' | 'plan';
  text: string;
  ts: number;
  confirmation?: ConfirmationCard;
  question?: QuestionCard;
  plan?: PlanCard;
  writes?: ExecutedWrite[];
  /** AJ-v4 transparency — tools the turn read (streamed status events). */
  toolsUsed?: string[];
  /** AJ-v4 transparency — the turn's model cost (shown to super_admin). */
  costUsd?: number;
  /** Hidden context appended when sending (e.g. attachment tags). */
  sendSuffix?: string;
}

interface AttachmentChip {
  id: string;
  fileName: string;
  rowCount: number;
}

let idSeq = 0;
const mkId = () => `m${Date.now().toString(36)}${(idSeq++).toString(36)}`;

/** Live-activity labels for the streamed status line (AJ-v4). */
const TOOL_LABELS: Record<string, string> = {
  list_projects: 'Reading projects',
  get_project_summary: 'Reading project detail',
  get_dashboard_kpis: 'Reading portfolio KPIs',
  search_actuals: 'Searching actuals',
  read_attachment: 'Reading the attachment',
  list_meetings: 'Reading meetings',
  get_meeting: 'Reading the meeting',
  list_opportunities: 'Reading the pipeline',
  get_opportunity: 'Reading the opportunity',
  research_comps: 'Researching comps (live)',
  create_project: 'Creating the project',
  update_project: 'Updating the project',
  create_actuals_entry: 'Recording actuals',
  create_risk: 'Recording the risk',
  archive_project: 'Archiving the project',
  create_opportunity: 'Creating the opportunity',
  update_opportunity: 'Updating the opportunity',
};
const toolLabel = (tool: string) => TOOL_LABELS[tool] ?? tool.replaceAll('_', ' ');

// ── Component ─────────────────────────────────────────────────────────────────

export function AskJunoWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [attachments, setAttachments] = useState<AttachmentChip[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const restoredRef = useRef(false);
  // AJ-v4 streaming state: the in-flight abort handle, the currently-open
  // streamed bubble, the last completed streamed bubble (preamble dedupe),
  // and the live tool-activity line.
  const abortRef = useRef<AbortController | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const lastStreamIdRef = useRef<string | null>(null);
  const [activity, setActivity] = useState<string | null>(null);
  // AJ-v4 history: the server-side conversation this chat snapshots into,
  // and the pane view (chat ↔ history list).
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [historyItems, setHistoryItems] = useState<
    Array<{ id: string; title: string; last_message_at: string }>
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const creatingConvRef = useRef(false);
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // AJ-v4 ergonomics: resizable width (persisted), failed-turn retry state.
  const [paneWidth, setPaneWidth] = useState(PANE_WIDTH_DEFAULT);
  const [lastFailed, setLastFailed] = useState(false);
  const lastTurnRef = useRef<{ history: ChatMessage[]; resume?: Resume } | null>(null);
  const dragRef = useRef(false);
  // AJ-v4 brief + transparency.
  const [brief, setBrief] = useState<{
    pending_suggestions: number;
    draft_capital_calls: number;
    draft_snapshots: number;
    show_cost: boolean;
  } | null>(null);
  const briefFetchedRef = useRef(false);

  const hidden = useMemo(
    () => HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`)),
    [pathname]
  );

  // ── Persistence (sessionStorage) ────────────────────────────────────────
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          messages?: ChatMessage[];
          open?: boolean;
          conversationId?: string | null;
        };
        if (Array.isArray(saved.messages)) setMessages(saved.messages.slice(-120));
        if (saved.open) setOpen(true);
        if (typeof saved.conversationId === 'string') setConversationId(saved.conversationId);
      }
    } catch {
      /* corrupt state — start fresh */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ messages: messages.slice(-120), open, conversationId })
      );
    } catch {
      /* quota — non-critical */
    }
  }, [messages, open, conversationId]);

  // ── AJ-v4 server-side history ───────────────────────────────────────────
  // Debounced snapshot: after any message change, persist the conversation
  // (replace-all PUT). 900ms of quiet absorbs streaming deltas.
  useEffect(() => {
    if (!conversationId || messages.length === 0) return;
    if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
    const id = conversationId;
    const snapshot = messages.slice(-120);
    snapshotTimerRef.current = setTimeout(() => {
      void fetch(`/api/ask-juno/conversations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: snapshot }),
      }).catch(() => null);
    }, 900);
    return () => {
      if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
    };
  }, [messages, conversationId]);

  // AJ-v4 — one brief fetch per pane-open so the empty state opens with
  // "what needs attention" instead of silence.
  useEffect(() => {
    if (!open || hidden || briefFetchedRef.current) return;
    briefFetchedRef.current = true;
    void fetch('/api/ask-juno/brief')
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as {
          data?: {
            pending_suggestions?: number;
            draft_capital_calls?: number;
            draft_snapshots?: number;
            show_cost?: boolean;
          };
        } | null;
        if (res.ok && json?.data) {
          setBrief({
            pending_suggestions: json.data.pending_suggestions ?? 0,
            draft_capital_calls: json.data.draft_capital_calls ?? 0,
            draft_snapshots: json.data.draft_snapshots ?? 0,
            show_cost: json.data.show_cost ?? false,
          });
        }
      })
      .catch(() => null);
  }, [open, hidden]);

  /** Create the server conversation lazily on first send (idempotent-ish). */
  const ensureConversation = useCallback(async () => {
    if (conversationId || creatingConvRef.current) return;
    creatingConvRef.current = true;
    try {
      const res = await fetch('/api/ask-juno/conversations', { method: 'POST' });
      const json = (await res.json().catch(() => null)) as { data?: { id?: string } } | null;
      if (res.ok && json?.data?.id) setConversationId(json.data.id);
    } catch {
      /* history is best-effort — chat works without it */
    } finally {
      creatingConvRef.current = false;
    }
  }, [conversationId]);

  const openHistory = useCallback(async () => {
    setView('history');
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/ask-juno/conversations');
      const json = (await res.json().catch(() => null)) as {
        data?: { conversations?: Array<{ id: string; title: string; last_message_at: string }> };
      } | null;
      setHistoryItems(json?.data?.conversations ?? []);
    } catch {
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/ask-juno/conversations/${id}`);
      const json = (await res.json().catch(() => null)) as {
        data?: { id?: string; messages?: ChatMessage[] };
      } | null;
      if (res.ok && Array.isArray(json?.data?.messages)) {
        setMessages(json.data.messages.slice(-120));
        setConversationId(id);
        setView('chat');
      }
    } catch {
      /* leave the list open */
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const archiveConversation = useCallback(
    async (id: string) => {
      setHistoryItems((items) => items.filter((x) => x.id !== id));
      if (conversationId === id) setConversationId(null);
      void fetch(`/api/ask-juno/conversations/${id}`, { method: 'DELETE' }).catch(() => null);
    },
    [conversationId]
  );

  // ── Pane width (AJ-v4: persisted, drag-resizable) ───────────────────────
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(WIDTH_KEY));
      if (Number.isFinite(saved) && saved >= PANE_WIDTH_MIN && saved <= PANE_WIDTH_MAX) {
        setPaneWidth(saved);
      }
    } catch {
      /* default width */
    }
  }, []);
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const w = Math.min(PANE_WIDTH_MAX, Math.max(PANE_WIDTH_MIN, window.innerWidth - ev.clientX));
      setPaneWidth(w);
    };
    const onUp = () => {
      dragRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setPaneWidth((w) => {
        try {
          localStorage.setItem(WIDTH_KEY, String(w));
        } catch {
          /* noop */
        }
        return w;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  // ── Content shift (the "pane" behaviour) ────────────────────────────────
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    const apply = () => {
      const shift = open && !hidden && window.innerWidth >= SHIFT_MIN_VIEWPORT;
      body.style.transition = 'padding-right 200ms ease';
      body.style.paddingRight = shift ? `${paneWidth}px` : '';
    };
    apply();
    window.addEventListener('resize', apply);
    return () => {
      window.removeEventListener('resize', apply);
      body.style.paddingRight = '';
    };
  }, [open, hidden, paneWidth]);

  // ── Open/close plumbing ─────────────────────────────────────────────────
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('atlas:open-ask-juno', onOpen);
    return () => window.removeEventListener('atlas:open-ask-juno', onOpen);
  }, []);
  // AJ-v4 — Ctrl/Cmd+J toggles the pane anywhere it's mountable.
  useEffect(() => {
    if (hidden) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hidden]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);
  // AJ-v5 — follow the stream only while pinned to the bottom; otherwise
  // offer a quiet "New reply" jump pill instead of yanking the reader down.
  const pinnedRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const onListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    pinnedRef.current = pinned;
    if (pinned) setShowJump(false);
  }, []);
  const jumpToLatest = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    pinnedRef.current = true;
    setShowJump(false);
  }, []);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (pinnedRef.current) el.scrollTop = el.scrollHeight;
    else setShowJump(true);
  }, [messages, pending]);
  // AJ-v5 — overlay mode (viewport too narrow to shift content): scrim
  // behind the pane; clicking it closes.
  const [isOverlay, setIsOverlay] = useState(false);
  useEffect(() => {
    const check = () => setIsOverlay(window.innerWidth < SHIFT_MIN_VIEWPORT);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  // AJ-v5 — elapsed-seconds ticker for the live activity strip.
  const [elapsedS, setElapsedS] = useState(0);
  useEffect(() => {
    if (!pending) return;
    const start = Date.now();
    setElapsedS(0);
    const t = setInterval(() => setElapsedS(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [pending]);

  const push = useCallback((msg: Omit<ChatMessage, 'id' | 'ts'>) => {
    setMessages((m) => [...m, { ...msg, id: mkId(), ts: Date.now() }]);
  }, []);

  // ── Server round-trip ───────────────────────────────────────────────────

  type Resume = {
    kind: 'confirmed_tool' | 'declined_tool' | 'answered_question' | 'approved_plan';
    tool_use_id: string;
    name: string;
    args: Record<string, unknown>;
    answer?: string;
    /** approved_plan: indices of the items the user kept ticked. */
    selected?: number[];
  };

  const historyForSend = useCallback(
    (msgs: ChatMessage[]) =>
      msgs
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.text.trim())
        .slice(-HISTORY_SEND_CAP)
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.sendSuffix ? `${m.text}\n\n${m.sendSuffix}` : m.text,
        })),
    []
  );

  interface FinalPayload {
    type?: string;
    text?: string;
    tool_name?: string;
    tool_use_id?: string;
    tool_args?: Record<string, unknown>;
    reason?: string;
    preamble?: string;
    question?: string;
    options?: Array<{ label: string; description?: string }>;
    title?: string;
    items?: PlanItemView[];
    executed_writes?: ExecutedWrite[];
    cost_usd?: number;
  }

  const callAgent = useCallback(
    async (history: ChatMessage[], resume?: Resume) => {
      setPending(true);
      setLastFailed(false);
      lastTurnRef.current = { history, resume };
      const ac = new AbortController();
      abortRef.current = ac;
      draftIdRef.current = null;
      lastStreamIdRef.current = null;
      // AJ-v4 transparency — READ tools this turn touched (from status events).
      const toolsUsed: string[] = [];

      // Append streamed text into the currently-open assistant bubble,
      // opening one on the first token.
      const appendDelta = (d: string) => {
        if (!d) return;
        if (draftIdRef.current === null) {
          const id = mkId();
          draftIdRef.current = id;
          setMessages((m) => [...m, { id, role: 'assistant', text: d, ts: Date.now() }]);
        } else {
          const id = draftIdRef.current;
          setMessages((m) => m.map((x) => (x.id === id ? { ...x, text: x.text + d } : x)));
        }
      };
      // Patch the open (or most recent) streamed bubble; false if none exists.
      const attachToStreamBubble = (patch: (msg: ChatMessage) => ChatMessage): boolean => {
        const id = draftIdRef.current ?? lastStreamIdRef.current;
        if (!id) return false;
        setMessages((m) => m.map((x) => (x.id === id ? patch(x) : x)));
        return true;
      };

      // The final payload is identical in both transports; `streamed` tells us
      // whether the text already landed via deltas (dedupe the bubble).
      const applyFinal = (d: FinalPayload | undefined | null, streamed: boolean) => {
        if (!d) {
          push({ role: 'system', text: '(empty response)' });
          return;
        }
        const writes = d.executed_writes?.length ? d.executed_writes : undefined;
        const hasStreamBubble =
          streamed && (draftIdRef.current !== null || lastStreamIdRef.current !== null);

        if (d.type === 'reply' || d.type === 'error') {
          const meta = {
            toolsUsed: toolsUsed.length ? [...toolsUsed] : undefined,
            costUsd: typeof d.cost_usd === 'number' ? d.cost_usd : undefined,
          };
          if (hasStreamBubble) {
            attachToStreamBubble((x) => ({
              ...x,
              text: x.text.trim() ? x.text : (d.text ?? '(no reply)'),
              writes: writes ?? x.writes,
              ...meta,
            }));
          } else {
            push({ role: 'assistant', text: d.text ?? '(no reply)', writes, ...meta });
          }
          return;
        }

        if (d.type === 'ask_user' && d.tool_use_id) {
          if (hasStreamBubble) attachToStreamBubble((x) => ({ ...x, writes: writes ?? x.writes }));
          else if (d.preamble) push({ role: 'assistant', text: d.preamble, writes });
          push({
            role: 'question',
            text: '',
            question: {
              tool_use_id: d.tool_use_id,
              tool_args: d.tool_args ?? {},
              question: d.question ?? 'Which option?',
              options: d.options ?? [],
            },
          });
          return;
        }

        if (d.type === 'pending_confirmation' && d.tool_name && d.tool_use_id) {
          if (hasStreamBubble) attachToStreamBubble((x) => ({ ...x, writes: writes ?? x.writes }));
          else if (d.preamble) push({ role: 'assistant', text: d.preamble, writes });
          push({
            role: 'confirmation',
            text: '',
            confirmation: {
              tool_name: d.tool_name,
              tool_use_id: d.tool_use_id,
              tool_args: d.tool_args ?? {},
              reason: d.reason ?? '',
            },
          });
          return;
        }

        if (d.type === 'pending_plan' && d.tool_use_id && d.items?.length) {
          if (hasStreamBubble) attachToStreamBubble((x) => ({ ...x, writes: writes ?? x.writes }));
          else if (d.preamble) push({ role: 'assistant', text: d.preamble, writes });
          push({
            role: 'plan',
            text: '',
            plan: {
              tool_use_id: d.tool_use_id,
              tool_args: d.tool_args ?? {},
              title: d.title ?? 'Proposed changes',
              items: d.items,
            },
          });
          return;
        }

        push({ role: 'assistant', text: d.text ?? '(no reply)', writes });
      };

      try {
        const res = await fetch('/api/ask-juno', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify({ messages: historyForSend(history), pathname, resume }),
          signal: ac.signal,
        });

        const ctype = res.headers?.get?.('content-type') ?? '';

        if (res.ok && ctype.includes('text/event-stream') && res.body) {
          // ── AJ-v4 streamed turn ─────────────────────────────────────────
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let gotFinal = false;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            for (;;) {
              const sep = buffer.indexOf('\n\n');
              if (sep === -1) break;
              const frame = buffer.slice(0, sep);
              buffer = buffer.slice(sep + 2);
              for (const line of frame.split('\n')) {
                if (!line.startsWith('data:')) continue;
                let ev: {
                  t?: string;
                  d?: string;
                  tool?: string;
                  write?: ExecutedWrite;
                  response?: FinalPayload;
                };
                try {
                  ev = JSON.parse(line.slice(5).trim()) as typeof ev;
                } catch {
                  continue;
                }
                if (ev.t === 'delta' && ev.d) {
                  appendDelta(ev.d);
                } else if (ev.t === 'text_end') {
                  lastStreamIdRef.current = draftIdRef.current ?? lastStreamIdRef.current;
                  draftIdRef.current = null;
                } else if (ev.t === 'status' && ev.tool) {
                  setActivity(`${toolLabel(ev.tool)}…`);
                  if (!toolsUsed.includes(ev.tool)) toolsUsed.push(ev.tool);
                } else if (ev.t === 'write' && ev.write) {
                  setActivity(null);
                  const w = ev.write;
                  const attached = attachToStreamBubble((x) => ({
                    ...x,
                    writes: [...(x.writes ?? []), w],
                  }));
                  if (!attached) {
                    const id = mkId();
                    lastStreamIdRef.current = id;
                    setMessages((m) => [
                      ...m,
                      { id, role: 'assistant', text: '', ts: Date.now(), writes: [w] },
                    ]);
                  }
                } else if (ev.t === 'final') {
                  gotFinal = true;
                  setActivity(null);
                  applyFinal(ev.response, true);
                }
              }
            }
          }
          if (!gotFinal) {
            setLastFailed(true);
            push({
              role: 'system',
              text: 'The connection dropped mid-turn — the transcript above is what completed.',
            });
          }
          return;
        }

        // ── JSON path (error responses, tests, non-stream servers) ────────
        const json = (await res.json().catch(() => null)) as {
          data?: FinalPayload;
          error?: { message?: string };
        } | null;

        if (!res.ok) {
          setLastFailed(true);
          push({
            role: 'system',
            text: json?.error?.message ?? `Request failed (HTTP ${res.status}).`,
          });
          return;
        }
        applyFinal(json?.data, false);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          push({ role: 'system', text: 'Stopped.' });
        } else {
          setLastFailed(true);
          push({
            role: 'system',
            text: `Couldn't reach Juno: ${err instanceof Error ? err.message : 'network error'}`,
          });
        }
      } finally {
        setPending(false);
        setActivity(null);
        abortRef.current = null;
        draftIdRef.current = null;
        lastStreamIdRef.current = null;
      }
    },
    [historyForSend, pathname, push]
  );

  // ── Send / resume actions ───────────────────────────────────────────────

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || pending) return;
      const suffix = attachments.length
        ? attachments
            .map((a) => `[attachment:${a.id} ${a.fileName} — ${a.rowCount} rows]`)
            .join('\n')
        : undefined;
      const userMsg: ChatMessage = {
        id: mkId(),
        role: 'user',
        text: trimmed,
        ts: Date.now(),
        sendSuffix: suffix,
      };
      const updated = [...messages, userMsg];
      setMessages(updated);
      setInput('');
      setAttachments([]);
      setView('chat');
      void ensureConversation(); // history is best-effort; never blocks the turn
      await callAgent(updated);
    },
    [pending, attachments, messages, callAgent, ensureConversation]
  );

  const onSend = useCallback(async () => {
    await sendText(input);
  }, [input, sendText]);

  // AJ-v4 — re-run the last failed turn verbatim.
  const onRetry = useCallback(async () => {
    const last = lastTurnRef.current;
    if (!last || pending) return;
    await callAgent(last.history, last.resume);
  }, [pending, callAgent]);

  const resolveConfirmation = useCallback(
    async (msgId: string, approved: boolean) => {
      const msg = messages.find((m) => m.id === msgId);
      const card = msg?.confirmation;
      if (!card || pending) return;
      setMessages((m) =>
        m.map((x) =>
          x.id === msgId
            ? {
                ...x,
                confirmation: { ...card, resolved: approved ? 'approved' : 'declined' },
              }
            : x
        )
      );
      if (approved) {
        push({ role: 'tool_status', text: `Running ${card.tool_name}…` });
      }
      await callAgent(messages, {
        kind: approved ? 'confirmed_tool' : 'declined_tool',
        tool_use_id: card.tool_use_id,
        name: card.tool_name,
        args: card.tool_args,
      });
    },
    [messages, pending, callAgent, push]
  );

  // AJ-v4 — undo an update_project receipt: re-applies the captured
  // before-values server-side; the revert is itself audited.
  const revertWrite = useCallback(
    async (msgId: string, writeIdx: number) => {
      const msg = messages.find((m) => m.id === msgId);
      const w = msg?.writes?.[writeIdx];
      if (!w?.audit_log_id || w.reverted || pending) return;
      try {
        const res = await fetch('/api/ask-juno/revert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audit_log_id: w.audit_log_id }),
        });
        const json = (await res.json().catch(() => null)) as {
          data?: { reverted?: boolean; project_key?: string };
          error?: { message?: string };
        } | null;
        if (!res.ok || !json?.data?.reverted) {
          push({
            role: 'system',
            text: json?.error?.message ?? `Revert failed (HTTP ${res.status}).`,
          });
          return;
        }
        setMessages((m) =>
          m.map((x) =>
            x.id === msgId
              ? {
                  ...x,
                  writes: x.writes?.map((ww, i) =>
                    i === writeIdx ? { ...ww, reverted: true } : ww
                  ),
                }
              : x
          )
        );
        push({
          role: 'tool_status',
          text: `Reverted ${json.data.project_key ?? ''} to its previous figures.`,
        });
      } catch {
        push({ role: 'system', text: 'Revert failed — network error.' });
      }
    },
    [messages, pending, push]
  );

  // AJ-v4 — resolve a batch plan: approve the ticked subset or decline all.
  const resolvePlan = useCallback(
    async (msgId: string, approved: boolean, selected: number[]) => {
      const msg = messages.find((m) => m.id === msgId);
      const card = msg?.plan;
      if (!card || pending) return;
      setMessages((m) =>
        m.map((x) =>
          x.id === msgId
            ? {
                ...x,
                plan: {
                  ...card,
                  resolved: approved ? 'approved' : 'declined',
                  approvedCount: approved ? selected.length : 0,
                },
              }
            : x
        )
      );
      await callAgent(messages, {
        kind: approved ? 'approved_plan' : 'declined_tool',
        tool_use_id: card.tool_use_id,
        name: 'propose_changes',
        args: card.tool_args,
        selected: approved ? selected : undefined,
      });
    },
    [messages, pending, callAgent]
  );

  const answerQuestion = useCallback(
    async (msgId: string, answer: string) => {
      const msg = messages.find((m) => m.id === msgId);
      const q = msg?.question;
      if (!q || pending || !answer.trim()) return;
      setMessages((m) =>
        m.map((x) => (x.id === msgId ? { ...x, question: { ...q, answered: answer } } : x))
      );
      await callAgent(messages, {
        kind: 'answered_question',
        tool_use_id: q.tool_use_id,
        name: 'ask_user',
        args: q.tool_args,
        answer,
      });
    },
    [messages, pending, callAgent]
  );

  // ── Attachments ─────────────────────────────────────────────────────────

  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/ask-juno/attachments', { method: 'POST', body: form });
        const json = (await res.json().catch(() => null)) as {
          data?: { attachment_id?: string; file_name?: string; row_count?: number };
          error?: { message?: string };
        } | null;
        if (!res.ok || !json?.data?.attachment_id) {
          push({
            role: 'system',
            text: json?.error?.message ?? `Upload failed (HTTP ${res.status}).`,
          });
          return;
        }
        setAttachments((a) => [
          ...a,
          {
            id: json.data!.attachment_id!,
            fileName: json.data!.file_name ?? file.name,
            rowCount: json.data!.row_count ?? 0,
          },
        ]);
      } catch (err) {
        push({
          role: 'system',
          text: `Upload error: ${err instanceof Error ? err.message : 'network error'}`,
        });
      } finally {
        setUploading(false);
      }
    },
    [push]
  );

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';
      await uploadFile(file);
    },
    [uploadFile]
  );

  // ── AJ-v4 paste-from-Excel ──────────────────────────────────────────────
  // A copied Excel/Sheets range lands as text/html (<table>) + TSV. Detect a
  // grid, convert to CSV, and push it through the normal attachment path —
  // no file-saving round-trip.
  const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (uploading || pending) return;
      let grid: string[][] | null = null;

      const html = e.clipboardData.getData('text/html');
      if (html && html.includes('<table')) {
        try {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const rows = Array.from(doc.querySelectorAll('table tr'));
          const parsed = rows.map((tr) =>
            Array.from(tr.querySelectorAll('td,th')).map((c) => (c.textContent ?? '').trim())
          );
          if (parsed.length > 0 && parsed.some((r) => r.length > 1)) grid = parsed;
        } catch {
          grid = null;
        }
      }
      if (!grid) {
        const text = e.clipboardData.getData('text/plain');
        if (text && text.includes('\t') && text.includes('\n')) {
          const parsed = text
            .replace(/\r/g, '')
            .split('\n')
            .filter((l, i, arr) => l.length > 0 || i < arr.length - 1)
            .map((l) => l.split('\t'));
          if (parsed.length > 1 && parsed.some((r) => r.length > 1)) grid = parsed;
        }
      }
      if (!grid) return; // ordinary paste — let the textarea have it

      e.preventDefault();
      const csv = grid.map((r) => r.map(csvCell).join(',')).join('\n');
      const file = new File([csv], 'pasted-table.csv', { type: 'text/csv' });
      void uploadFile(file);
    },
    [uploading, pending, uploadFile]
  );

  const newChat = useCallback(() => {
    setMessages([]);
    setAttachments([]);
    setInput('');
    setConversationId(null);
    setView('chat');
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
  }, []);

  const onKeyInInput = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void onSend();
    }
  };

  if (hidden || !open) return null;

  // ── Render ──────────────────────────────────────────────────────────────

  // AJ-v5 — the active conversation's derived title (first user message).
  const firstUser = messages.find((m) => m.role === 'user');
  const convTitle = firstUser
    ? firstUser.text.length > 44
      ? `${firstUser.text.slice(0, 44)}…`
      : firstUser.text
    : 'Reads the platform · acts with your approval';

  return (
    <>
      {isOverlay && (
        <div
          aria-hidden="true"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(17,17,17,0.28)',
            zIndex: 59,
          }}
        />
      )}
      <aside
        id="ask-juno-panel"
        role="complementary"
        aria-label="Ask Juno working pane"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: paneWidth,
          maxWidth: '100vw',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-surface-base, #ffffff)',
          // AJ-v5 — the pane is its own material: hairline seam + soft cast,
          // no hard border.
          boxShadow: '0 0 0 1px rgba(17,17,17,0.06), -12px 0 32px rgba(17,17,17,0.07)',
          zIndex: 60,
          animation: 'ajPaneIn 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* AJ-v5 — component-scoped keyframes + the few things inline styles
          can't do (thin scrollbar, reduced-motion). Single instance per pane. */}
        <style>{`
        @keyframes ajPaneIn { from { transform: translateX(24px); opacity: 0.6; } to { transform: none; opacity: 1; } }
        @keyframes ajMsgIn { from { transform: translateY(4px); opacity: 0; } to { transform: none; opacity: 1; } }
        @keyframes ajShimmer { from { left: -40%; } to { left: 100%; } }
        @keyframes ajBlink { 50% { opacity: 0; } }
        #ask-juno-panel .aj-scroll { scrollbar-width: thin; scrollbar-color: var(--color-border-hairline) transparent; }
        #ask-juno-panel .aj-scroll::-webkit-scrollbar { width: 7px; }
        #ask-juno-panel .aj-scroll::-webkit-scrollbar-thumb { background: var(--color-border-hairline); border-radius: 99px; }
        #ask-juno-panel .aj-scroll::-webkit-scrollbar-track { background: transparent; }
        #ask-juno-panel .aj-msg { animation: ajMsgIn 160ms cubic-bezier(0.16, 1, 0.3, 1); }
        @media (prefers-reduced-motion: reduce) {
          #ask-juno-panel, #ask-juno-panel * { animation: none !important; }
        }
      `}</style>
        {/* AJ-v4 — drag handle (left edge) for resizing */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize Ask Juno pane"
          onMouseDown={onDragStart}
          style={{
            position: 'absolute',
            left: -3,
            top: 0,
            bottom: 0,
            width: 6,
            cursor: 'col-resize',
            zIndex: 61,
          }}
        />
        {/* Header — mark + living title + quiet icon cluster */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '11px 14px',
            borderBottom: '1px solid var(--color-border-subtle, #f0f0ee)',
            flexShrink: 0,
          }}
        >
          <JunoMark size={22} ariaLabel="Juno" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '-0.011em',
                color: 'var(--color-text-primary)',
              }}
            >
              Juno
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--color-text-tertiary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {convTitle}
            </div>
          </div>
          <button
            type="button"
            onClick={() => (view === 'history' ? setView('chat') : void openHistory())}
            title={view === 'history' ? 'Back to the conversation' : 'Past conversations'}
            aria-label={view === 'history' ? 'Back to the conversation' : 'History'}
            style={iconBtn}
          >
            {view === 'history' ? <IconChevronLeft /> : <IconClock />}
          </button>
          <button
            type="button"
            onClick={newChat}
            title="Start a new conversation"
            aria-label="New conversation"
            style={iconBtn}
          >
            <IconPlus />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close Ask Juno"
            style={iconBtn}
          >
            <IconX />
          </button>
        </header>

        {/* Messages / history */}
        <div
          ref={listRef}
          onScroll={onListScroll}
          className="aj-scroll"
          style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px', position: 'relative' }}
        >
          {view === 'history' && (
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  marginBottom: 8,
                }}
              >
                Past conversations
              </div>
              {historyLoading && (
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading…</div>
              )}
              {!historyLoading && historyItems.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  No saved conversations yet — they land here after your first exchange.
                </div>
              )}
              {historyItems.map((h) => (
                <div
                  key={h.id}
                  style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '4px 0' }}
                >
                  <button
                    type="button"
                    onClick={() => void loadConversation(h.id)}
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--color-border-hairline)',
                      background:
                        h.id === conversationId
                          ? 'var(--color-surface-raised, #f7f7f5)'
                          : 'var(--color-surface-base)',
                      cursor: 'pointer',
                      fontSize: 12.5,
                      color: 'var(--color-text-primary)',
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h.title}
                    </span>
                    <span style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>
                      {new Date(h.last_message_at).toLocaleString()}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void archiveConversation(h.id)}
                    aria-label={`Delete ${h.title}`}
                    style={iconBtn}
                  >
                    <IconX />
                  </button>
                </div>
              ))}
            </div>
          )}

          {view === 'chat' && messages.length === 0 && (
            <div
              style={{ position: 'relative', paddingTop: 10, overflow: 'hidden', minHeight: 300 }}
            >
              {/* brand-sand watermark — presence, not noise */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  right: -40,
                  top: 150,
                  width: 180,
                  height: 180,
                  borderRadius: 44,
                  background: 'var(--color-brand-sand, #e8dfcc)',
                  opacity: 0.2,
                  transform: 'rotate(8deg)',
                  pointerEvents: 'none',
                }}
              />
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  color: 'var(--color-text-primary)',
                }}
              >
                {(() => {
                  const h = new Date().getHours();
                  return h < 12 ? 'Good morning.' : h < 18 ? 'Good afternoon.' : 'Good evening.';
                })()}
              </div>
              <p
                style={{
                  margin: '6px 0 16px',
                  fontSize: 12.5,
                  lineHeight: 1.6,
                  color: 'var(--color-text-secondary)',
                  maxWidth: '42ch',
                }}
              >
                {brief &&
                brief.pending_suggestions + brief.draft_capital_calls + brief.draft_snapshots > 0
                  ? [
                      brief.pending_suggestions > 0 &&
                        `${brief.pending_suggestions} suggestion${brief.pending_suggestions === 1 ? '' : 's'} wait${brief.pending_suggestions === 1 ? 's' : ''} for review`,
                      brief.draft_capital_calls > 0 &&
                        `${brief.draft_capital_calls} draft capital call${brief.draft_capital_calls === 1 ? '' : 's'}`,
                      brief.draft_snapshots > 0 &&
                        `${brief.draft_snapshots} draft snapshot${brief.draft_snapshots === 1 ? '' : 's'}`,
                    ]
                      .filter(Boolean)
                      .join(' · ') + '.'
                  : 'I read the live platform and carry out changes you approve — ask, or start from one of these.'}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, position: 'relative' }}>
                {starterChips(pathname).map((c) => {
                  const count =
                    c.label === 'What needs my attention?' && brief
                      ? brief.pending_suggestions +
                        brief.draft_capital_calls +
                        brief.draft_snapshots
                      : 0;
                  return (
                    <button
                      key={c.label}
                      type="button"
                      onClick={() => void sendText(c.prompt)}
                      disabled={pending}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 7,
                        padding: '7px 13px',
                        borderRadius: 999,
                        border: '1px solid var(--color-border-subtle, #f0f0ee)',
                        background: 'var(--color-surface-base)',
                        boxShadow: '0 1px 2px rgba(17,17,17,0.04)',
                        cursor: 'pointer',
                        fontSize: 12.5,
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {c.label}
                      {count > 0 && (
                        <span
                          style={{
                            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                            fontSize: 10,
                            background: 'var(--color-surface-muted, #f4f4f2)',
                            borderRadius: 99,
                            padding: '1px 6px',
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p
                style={{
                  margin: '18px 0 0',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  color: 'var(--color-text-quaternary)',
                }}
              >
                <kbd
                  style={{
                    fontFamily: 'inherit',
                    border: '1px solid var(--color-border-subtle, #f0f0ee)',
                    borderBottomWidth: 2,
                    borderRadius: 5,
                    padding: '1px 5px',
                    marginRight: 2,
                  }}
                >
                  Ctrl
                </kbd>
                <kbd
                  style={{
                    fontFamily: 'inherit',
                    border: '1px solid var(--color-border-subtle, #f0f0ee)',
                    borderBottomWidth: 2,
                    borderRadius: 5,
                    padding: '1px 5px',
                    marginRight: 6,
                  }}
                >
                  J
                </kbd>
                opens Juno anywhere · paste a spreadsheet to update figures
              </p>
            </div>
          )}

          {view === 'chat' &&
            messages.map((m) => (
              <MessageRow
                key={m.id}
                msg={m}
                busy={pending}
                onConfirm={(approved) => void resolveConfirmation(m.id, approved)}
                onAnswer={(answer) => void answerQuestion(m.id, answer)}
                onPlan={(approved, selected) => void resolvePlan(m.id, approved, selected)}
                onRevert={(writeIdx) => void revertWrite(m.id, writeIdx)}
                showCost={brief?.show_cost ?? false}
              />
            ))}

          {view === 'chat' && pending && (
            <div
              aria-live="polite"
              className="aj-msg"
              style={{
                margin: '10px 0 6px 28px',
                maxWidth: 320,
                padding: '8px 11px 9px',
                borderRadius: 9,
                border: '1px solid var(--color-border-subtle, #f0f0ee)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  fontSize: 10.5,
                  color: 'var(--color-text-secondary)',
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  {(activity ?? 'thinking…').toLowerCase()}
                </span>
                <span style={{ color: 'var(--color-text-quaternary)' }}>{elapsedS}s</span>
              </div>
              <div
                style={{
                  marginTop: 7,
                  height: 2,
                  borderRadius: 99,
                  overflow: 'hidden',
                  background: 'var(--color-border-subtle, #f0f0ee)',
                  position: 'relative',
                }}
              >
                <i
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    width: '40%',
                    borderRadius: 99,
                    background: 'var(--color-accent-lime-pressed, #c5d44c)',
                    animation: 'ajShimmer 1.3s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                  }}
                />
              </div>
            </div>
          )}

          {view === 'chat' && lastFailed && !pending && (
            <div style={{ padding: '4px 0 4px 28px' }}>
              <button type="button" onClick={() => void onRetry()} style={ghostBtn}>
                ↻ Retry
              </button>
            </div>
          )}
        </div>

        {/* AJ-v5 — jump pill: new content landed while scrolled up */}
        {showJump && view === 'chat' && (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              type="button"
              onClick={jumpToLatest}
              style={{
                position: 'absolute',
                bottom: 8,
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: 11.5,
                padding: '5px 12px',
                borderRadius: 999,
                border: '1px solid var(--color-border-hairline)',
                background: 'var(--color-surface-base)',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(17,17,17,0.08)',
                zIndex: 2,
              }}
            >
              ↓ New reply
            </button>
          </div>
        )}

        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              padding: '8px 16px 0',
              flexShrink: 0,
            }}
          >
            {attachments.map((a) => (
              <span
                key={a.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11.5,
                  padding: '3px 10px',
                  borderRadius: 999,
                  border: '1px solid var(--color-border-hairline)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <IconPaperclip /> {a.fileName} · {a.rowCount} rows
                <button
                  type="button"
                  onClick={() => setAttachments((x) => x.filter((y) => y.id !== a.id))}
                  aria-label={`Remove ${a.fileName}`}
                  style={{
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-text-tertiary)',
                    padding: 0,
                    display: 'inline-flex',
                  }}
                >
                  <IconX />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Composer — one soft container: field on top, action row beneath */}
        <div style={{ padding: '10px 12px 12px', flexShrink: 0 }}>
          <div
            style={{
              border: '1px solid var(--color-border-hairline)',
              borderRadius: 12,
              padding: '9px 10px 8px',
              background: 'var(--color-surface-base)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyInInput}
              onPaste={onPaste}
              rows={Math.min(6, Math.max(1, input.split('\n').length))}
              placeholder="Ask, or tell Juno what to change…"
              style={{
                resize: 'none',
                padding: '0 2px',
                fontSize: 13.5,
                fontFamily: 'inherit',
                lineHeight: 1.5,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: 'var(--color-text-primary)',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv"
                onChange={onFileChange}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || pending}
                title="Attach a spreadsheet (.xlsx or .csv)"
                aria-label="Attach a spreadsheet"
                style={{ ...iconBtn, width: 26, height: 26 }}
              >
                {uploading ? <span style={{ fontSize: 11 }}>…</span> : <IconPaperclip />}
              </button>
              {pending ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  aria-label="Stop Juno"
                  title="Stop"
                  style={{
                    marginLeft: 'auto',
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    border: '1px solid var(--color-border-hairline)',
                    background: 'var(--color-surface-base)',
                    color: 'var(--color-text-primary)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <IconStop />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void onSend()}
                  disabled={!input.trim()}
                  aria-label="Send"
                  title="Send"
                  style={{
                    marginLeft: 'auto',
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    border: 'none',
                    cursor: !input.trim() ? 'default' : 'pointer',
                    background: !input.trim()
                      ? 'var(--color-surface-muted, #f4f4f2)'
                      : 'var(--color-accent-lime, #ddec65)',
                    color: !input.trim()
                      ? 'var(--color-text-quaternary)'
                      : 'var(--color-text-on-lime, #0d0d0d)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <IconArrowUp />
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

// ── AJ-v5 inline icon set — 16px / 1.5px stroke (AppShell convention) ────────

function iconSvg(paths: React.ReactNode, size = 15) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}
const IconClock = () => (
  <>
    {iconSvg(
      <>
        <circle cx="10" cy="10" r="7.2" />
        <path d="M10 6.2v3.8l2.6 1.6" />
      </>
    )}
  </>
);
const IconPlus = () => <>{iconSvg(<path d="M10 4.5v11M4.5 10h11" />)}</>;
const IconX = () => <>{iconSvg(<path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />)}</>;
const IconChevronLeft = () => <>{iconSvg(<path d="M12 5l-6 5 6 5" />)}</>;
const IconPaperclip = () => (
  <>{iconSvg(<path d="M14.5 8.5l-5 5a2.5 2.5 0 01-3.5-3.5l6-6a1.8 1.8 0 012.5 2.5l-6 6" />, 14)}</>
);
const IconArrowUp = () => <>{iconSvg(<path d="M10 15V5M5.5 9.5L10 5l4.5 4.5" />, 14)}</>;
const IconStop = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <rect x="1" y="1" width="8" height="8" rx="1.5" fill="currentColor" />
  </svg>
);

// ── Message renderer ──────────────────────────────────────────────────────────

/** AJ-v5 — humanized field labels for plan/confirmation rows. */
const FIELD_LABELS: Record<string, string> = {
  sale_price_override_usd: 'Sale price override',
  build_cost_per_sqft: 'Build cost / sqft',
  land_cost_usd: 'Land cost',
  soft_costs_lump_sum: 'Soft costs (lump sum)',
  senior_ltv_pct: 'Senior LTV',
  interest_rate_apr: 'Interest rate',
  target_margin: 'Target margin',
  tax_rate_pct: 'Tax rate',
  villa_sqft_ag: 'Villa sqft (above grade)',
  villa_sqft_bg: 'Villa sqft (below grade)',
  purchase_date: 'Purchase date',
  project_key: 'Project',
  name: 'Name',
  address: 'Address',
  status: 'Status',
  stage: 'Stage',
};
const fieldLabel = (f: string) => FIELD_LABELS[f] ?? f.replaceAll('_', ' ');

const isMoneyField = (f: string) => /_usd$|_cents$|(^|_)(price|cost|costs)(_|$)/.test(f);
const isPctField = (f: string) => /_pct$|_apr$|margin|ltv/.test(f);

/** Compact value formatting for plan diff rows — money/percent aware. */
function fmtPlanVal(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'number') {
    if (isMoneyField(field)) {
      if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
      return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    }
    if (isPctField(field)) {
      const pct = Math.abs(v) <= 1.5 ? v * 100 : v;
      return `${pct.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
    }
    return v.toLocaleString('en-US', { maximumFractionDigits: 4 });
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function MessageRow({
  msg,
  busy,
  onConfirm,
  onAnswer,
  onPlan,
  onRevert,
  showCost,
}: {
  msg: ChatMessage;
  busy: boolean;
  onConfirm: (approved: boolean) => void;
  onAnswer: (answer: string) => void;
  onPlan: (approved: boolean, selected: number[]) => void;
  onRevert: (writeIdx: number) => void;
  showCost: boolean;
}) {
  const [freeText, setFreeText] = useState('');
  // Plan checkboxes — null means "all ticked" until the user touches one.
  const [unticked, setUnticked] = useState<Set<number>>(new Set());
  // Two-step revert arming (which receipt row is asking "confirm?").
  const [armedRevert, setArmedRevert] = useState<number | null>(null);

  if (msg.role === 'plan' && msg.plan) {
    const p = msg.plan;
    const selectedCount = p.items.length - unticked.size;
    const toggle = (i: number) =>
      setUnticked((s) => {
        const next = new Set(s);
        if (next.has(i)) next.delete(i);
        else next.add(i);
        return next;
      });
    return (
      <div style={cardBox}>
        <div style={cardLabel}>
          Plan
          {p.resolved
            ? ` — ${p.resolved}${p.resolved === 'approved' ? ` (${p.approvedCount})` : ''}`
            : ''}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {p.title}
        </div>
        <div style={{ margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {p.items.map((item, i) => (
            <label
              key={i}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid var(--color-border-hairline)',
                opacity: !p.resolved || !unticked.has(i) ? 1 : 0.45,
                cursor: p.resolved ? 'default' : 'pointer',
              }}
            >
              {!p.resolved && (
                <input
                  type="checkbox"
                  checked={!unticked.has(i)}
                  onChange={() => toggle(i)}
                  disabled={busy}
                  aria-label={`Include: ${item.summary}`}
                  style={{ marginTop: 2 }}
                />
              )}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{ display: 'block', fontSize: 12.5, color: 'var(--color-text-primary)' }}
                >
                  {item.summary}
                </span>
                {item.changes.map((c) => (
                  <span
                    key={c.field}
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 6,
                      fontSize: 12,
                      marginTop: 3,
                      wordBreak: 'break-word',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0, color: 'var(--color-text-secondary)' }}>
                      {fieldLabel(c.field)}
                    </span>
                    <s style={{ color: 'var(--color-text-quaternary)' }}>
                      {fmtPlanVal(c.field, c.before)}
                    </s>
                    <span aria-hidden="true" style={{ color: 'var(--color-text-quaternary)' }}>
                      →
                    </span>
                    <strong style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                      {fmtPlanVal(c.field, c.after)}
                    </strong>
                  </span>
                ))}
              </span>
            </label>
          ))}
        </div>
        {!p.resolved && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() =>
                onPlan(
                  true,
                  p.items.map((_, i) => i).filter((i) => !unticked.has(i))
                )
              }
              disabled={busy || selectedCount === 0}
              style={approveBtn}
            >
              Apply {selectedCount} change{selectedCount === 1 ? '' : 's'}
            </button>
            <button
              type="button"
              onClick={() => onPlan(false, [])}
              disabled={busy}
              style={ghostBtn}
            >
              Decline
            </button>
          </div>
        )}
      </div>
    );
  }

  if (msg.role === 'confirmation' && msg.confirmation) {
    const c = msg.confirmation;
    return (
      <div style={cardBox}>
        <div style={cardLabel}>Proposed action{c.resolved ? ` — ${c.resolved}` : ''}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {c.tool_name.replaceAll('_', ' ')}
          {typeof c.tool_args.project_key === 'string' ? ` · ${c.tool_args.project_key}` : ''}
        </div>
        <div style={{ margin: '6px 0 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {Object.entries(c.tool_args)
            .filter(([k]) => k !== 'project_key')
            .map(([k, v]) =>
              v !== null && typeof v === 'object' ? (
                <pre
                  key={k}
                  style={{
                    margin: 0,
                    fontSize: 11,
                    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  {k}: {JSON.stringify(v)}
                </pre>
              ) : (
                <span
                  key={k}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 6,
                    fontSize: 12,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--color-text-secondary)' }}>
                    {fieldLabel(k)}
                  </span>
                  <strong style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                    {fmtPlanVal(k, v)}
                  </strong>
                </span>
              )
            )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
          {c.reason}
        </div>
        {!c.resolved && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => onConfirm(true)}
              disabled={busy}
              style={approveBtn}
            >
              Approve &amp; run
            </button>
            <button type="button" onClick={() => onConfirm(false)} disabled={busy} style={ghostBtn}>
              Decline
            </button>
          </div>
        )}
      </div>
    );
  }

  if (msg.role === 'question' && msg.question) {
    const q = msg.question;
    return (
      <div style={cardBox}>
        <div style={cardLabel}>Juno asks</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-primary)', marginBottom: 8 }}>
          {q.question}
        </div>
        {q.answered ? (
          <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
            You chose: <strong>{q.answered}</strong>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {q.options.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => onAnswer(o.label)}
                  disabled={busy}
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--color-border-hairline)',
                    background: 'var(--color-surface-base)',
                    cursor: busy ? 'default' : 'pointer',
                    fontSize: 12.5,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{o.label}</span>
                  {o.description && (
                    <span style={{ color: 'var(--color-text-tertiary)' }}> — {o.description}</span>
                  )}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && freeText.trim()) onAnswer(freeText.trim());
                }}
                placeholder="Or type your own answer…"
                style={{
                  flex: 1,
                  padding: '7px 10px',
                  fontSize: 12,
                  borderRadius: 8,
                  border: '1px solid var(--color-border-hairline)',
                  background: 'var(--color-surface-base)',
                  color: 'var(--color-text-primary)',
                }}
              />
              <button
                type="button"
                onClick={() => freeText.trim() && onAnswer(freeText.trim())}
                disabled={busy || !freeText.trim()}
                style={ghostBtn}
              >
                Answer
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  const isUser = msg.role === 'user';
  const isMeta = msg.role === 'system' || msg.role === 'tool_status';

  // ── User: compact tinted bubble, right-aligned ──────────────────────────
  if (isUser) {
    return (
      <div
        className="aj-msg"
        style={{ display: 'flex', justifyContent: 'flex-end', margin: '8px 0 2px' }}
      >
        <div
          style={{
            maxWidth: '85%',
            padding: '8px 12px',
            borderRadius: '12px 12px 3px 12px',
            fontSize: 13.5,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            background: 'var(--color-surface-muted, #f4f4f2)',
            color: 'var(--color-text-primary)',
          }}
        >
          {msg.text}
        </div>
      </div>
    );
  }

  // ── Meta: quiet mono line ───────────────────────────────────────────────
  if (isMeta) {
    return (
      <div
        className="aj-msg"
        style={{
          margin: '4px 0 4px 28px',
          fontSize: 11,
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          color: 'var(--color-text-tertiary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {msg.text}
      </div>
    );
  }

  // ── Juno: full-width on the surface, small mark on the first line ───────
  const worked = msg.toolsUsed?.length ?? 0;
  return (
    <div className="aj-msg" style={{ display: 'flex', gap: 9, margin: '10px 0 2px' }}>
      <span style={{ flexShrink: 0, marginTop: 3 }} aria-hidden="true">
        <JunoMark size={19} ariaLabel="" />
      </span>
      <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.55 }}>
        {worked > 0 && (
          <details style={{ margin: '0 0 4px' }}>
            <summary
              style={{
                cursor: 'pointer',
                listStyle: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                fontSize: 10.5,
                color: 'var(--color-text-tertiary)',
              }}
            >
              <span aria-hidden="true">›</span> worked · {worked} step{worked === 1 ? '' : 's'}
            </summary>
            <span
              style={{
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                fontSize: 10.5,
                color: 'var(--color-text-tertiary)',
              }}
            >
              {msg.toolsUsed!.map((t) => t.replaceAll('_', ' ')).join(' · ')}
              {showCost && msg.costUsd !== undefined ? ` · $${msg.costUsd.toFixed(2)}` : ''}
            </span>
          </details>
        )}
        <div style={{ wordBreak: 'break-word', color: 'var(--color-text-primary)' }}>
          {renderMarkdown(msg.text)}
        </div>
        {msg.writes && msg.writes.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {msg.writes.map((w, i) => (
              <Receipt
                key={i}
                write={w}
                ts={msg.ts}
                busy={busy}
                armed={armedRevert === i}
                onArm={() => setArmedRevert(armedRevert === i ? null : i)}
                onRevert={() => {
                  setArmedRevert(null);
                  onRevert(i);
                }}
              />
            ))}
          </div>
        )}
        {worked === 0 && showCost && msg.costUsd !== undefined && (
          <div
            style={{
              marginTop: 6,
              fontSize: 10.5,
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              color: 'var(--color-text-quaternary)',
            }}
          >
            ${msg.costUsd.toFixed(2)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── AJ-v5 receipt: a sentence, a timestamp, the machinery behind ⋯ ──────────

const WRITE_VERBS: Record<string, string> = {
  update_project: 'Updated',
  create_project: 'Created',
  archive_project: 'Archived',
  create_actuals_entry: 'Recorded actuals for',
  create_risk: 'Recorded a risk on',
  create_opportunity: 'Added opportunity',
  update_opportunity: 'Updated opportunity',
  create_capital_call: 'Drafted a capital call for',
  create_scenario: 'Created scenario',
};

function Receipt({
  write: w,
  ts,
  busy,
  armed,
  onArm,
  onRevert,
}: {
  write: ExecutedWrite;
  ts: number;
  busy: boolean;
  armed: boolean;
  onArm: () => void;
  onRevert: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const verb = WRITE_VERBS[w.tool] ?? w.tool.replaceAll('_', ' ');
  const when = new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const canRevert = !w.reverted && w.tool === 'update_project' && !!w.audit_log_id;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
        color: 'var(--color-text-secondary)',
        opacity: w.reverted ? 0.6 : 1,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 16,
          height: 16,
          borderRadius: 999,
          flexShrink: 0,
          border: `1px solid ${w.reverted ? 'var(--color-text-quaternary)' : 'var(--color-positive, #15803d)'}`,
          color: w.reverted ? 'var(--color-text-quaternary)' : 'var(--color-positive, #15803d)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          lineHeight: 1,
        }}
      >
        {w.reverted ? '↩' : '✓'}
      </span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {verb}{' '}
        {w.entity?.href ? (
          <Link
            href={w.entity.href}
            style={{
              color: 'var(--color-text-primary)',
              textDecoration: 'none',
              borderBottom: '1px solid var(--color-border-hairline)',
            }}
          >
            {w.entity.label ?? w.entity.href}
          </Link>
        ) : (
          <span>{w.entity?.label ?? ''}</span>
        )}
        {w.reverted ? ' · reverted' : ''}
        {expanded && w.audit_log_id && (
          <span
            style={{
              marginLeft: 6,
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              fontSize: 10.5,
              color: 'var(--color-text-quaternary)',
            }}
          >
            audit {w.audit_log_id.slice(0, 8)}
          </span>
        )}
        {expanded && canRevert && (
          <button
            type="button"
            onClick={armed ? onRevert : onArm}
            disabled={busy}
            style={{
              marginLeft: 8,
              border: 'none',
              background: 'none',
              padding: 0,
              cursor: 'pointer',
              fontSize: 11,
              color: 'var(--color-text-secondary)',
              textDecoration: 'underline',
              fontWeight: armed ? 700 : 400,
            }}
          >
            {armed ? 'confirm revert' : 'revert'}
          </button>
        )}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          fontSize: 10.5,
          color: 'var(--color-text-quaternary)',
          flexShrink: 0,
        }}
      >
        {when}
      </span>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-label={expanded ? 'Hide receipt detail' : 'Receipt detail'}
        aria-expanded={expanded}
        style={{
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          padding: '0 2px',
          color: 'var(--color-text-quaternary)',
          fontSize: 13,
          letterSpacing: 1,
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        ⋯
      </button>
    </div>
  );
}

// ── Shared inline styles ──────────────────────────────────────────────────────

/** AJ-v5 — quiet 28px icon targets (header + composer chrome). */
const iconBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'transparent',
  color: 'var(--color-text-tertiary)',
  borderRadius: 8,
  cursor: 'pointer',
  flexShrink: 0,
  padding: 0,
};

/** AJ-v5 card family — one DNA for plan / confirmation / question cards. */
const cardBox: React.CSSProperties = {
  margin: '8px 0 8px 28px',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--color-border-subtle, #f0f0ee)',
  background: 'var(--color-surface-base)',
  boxShadow: '0 1px 2px rgba(17,17,17,0.04)',
};

const cardLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--color-text-tertiary)',
  marginBottom: 6,
};

const approveBtn: React.CSSProperties = {
  padding: '7px 14px',
  fontSize: 12.5,
  fontWeight: 500,
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  background: 'var(--color-accent-lime, #ddec65)',
  color: 'var(--color-text-on-lime, #0d0d0d)',
};

const ghostBtn: React.CSSProperties = {
  padding: '7px 12px',
  fontSize: 12.5,
  borderRadius: 8,
  border: '1px solid var(--color-border-hairline)',
  background: 'var(--color-surface-base)',
  color: 'var(--color-text-secondary)',
  cursor: 'pointer',
};
