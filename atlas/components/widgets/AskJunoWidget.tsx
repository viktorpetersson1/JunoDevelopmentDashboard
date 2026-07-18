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
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, pending]);

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

  return (
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
        borderLeft: '1px solid var(--color-border-hairline, #e5e5e2)',
        boxShadow: '-8px 0 24px rgba(0,0,0,0.06)',
        zIndex: 60,
      }}
    >
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
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-border-hairline, #e5e5e2)',
          flexShrink: 0,
        }}
      >
        <JunoMark size={22} ariaLabel="Juno" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Ask Juno
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            Reads the platform · carries out changes you approve
          </div>
        </div>
        <button
          type="button"
          onClick={() => (view === 'history' ? setView('chat') : void openHistory())}
          title={view === 'history' ? 'Back to the conversation' : 'Past conversations'}
          style={hdrBtn}
        >
          {view === 'history' ? 'Back' : 'History'}
        </button>
        <button type="button" onClick={newChat} title="Start a new conversation" style={hdrBtn}>
          New
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close Ask Juno"
          style={hdrBtn}
        >
          ✕
        </button>
      </header>

      {/* Messages / history */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
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
                  style={{ ...hdrBtn, padding: '6px 8px' }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {view === 'chat' && messages.length === 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', lineHeight: 1.6 }}>
            {brief &&
              brief.pending_suggestions + brief.draft_capital_calls + brief.draft_snapshots > 0 && (
                <p
                  style={{
                    margin: '0 0 10px',
                    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                    fontSize: 11.5,
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  ●{' '}
                  {[
                    brief.pending_suggestions > 0 &&
                      `${brief.pending_suggestions} pending suggestion${brief.pending_suggestions === 1 ? '' : 's'}`,
                    brief.draft_capital_calls > 0 &&
                      `${brief.draft_capital_calls} draft capital call${brief.draft_capital_calls === 1 ? '' : 's'}`,
                    brief.draft_snapshots > 0 &&
                      `${brief.draft_snapshots} draft snapshot${brief.draft_snapshots === 1 ? '' : 's'}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
            <p style={{ margin: '0 0 10px' }}>
              I read the live platform and carry out changes you approve. Start with one of these,
              or just ask:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {starterChips(pathname).map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => void sendText(c.prompt)}
                  disabled={pending}
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--color-border-hairline)',
                    background: 'var(--color-surface-base)',
                    cursor: 'pointer',
                    fontSize: 12.5,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <p style={{ margin: '10px 0 0' }}>
              Changes always show a confirmation card first (batches get one plan card with before →
              after). Attach or paste a spreadsheet to update figures in bulk.
              <kbd
                style={{
                  marginLeft: 4,
                  fontSize: 10.5,
                  border: '1px solid var(--color-border-hairline)',
                  borderRadius: 4,
                  padding: '0 4px',
                }}
              >
                Ctrl+J
              </kbd>{' '}
              toggles this pane.
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
            style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '6px 0' }}
          >
            {activity ?? 'Juno is working…'}
          </div>
        )}

        {view === 'chat' && lastFailed && !pending && (
          <div style={{ padding: '4px 0' }}>
            <button type="button" onClick={() => void onRetry()} style={hdrBtn}>
              ↻ Retry
            </button>
          </div>
        )}
      </div>

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
              📎 {a.fileName} · {a.rowCount} rows
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
                }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Composer */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
          padding: '10px 16px 14px',
          borderTop: '1px solid var(--color-border-hairline, #e5e5e2)',
          flexShrink: 0,
        }}
      >
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
          style={{ ...hdrBtn, fontSize: 15, padding: '8px 10px' }}
        >
          {uploading ? '…' : '📎'}
        </button>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyInInput}
          onPaste={onPaste}
          rows={Math.min(5, Math.max(1, input.split('\n').length))}
          placeholder="Ask, or tell me what to change…"
          style={{
            flex: 1,
            resize: 'none',
            padding: '9px 12px',
            fontSize: 13,
            fontFamily: 'inherit',
            lineHeight: 1.45,
            borderRadius: 10,
            border: '1px solid var(--color-border-hairline)',
            background: 'var(--color-surface-base)',
            color: 'var(--color-text-primary)',
          }}
        />
        {pending && (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            aria-label="Stop Juno"
            style={{
              padding: '9px 14px',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 10,
              border: '1px solid var(--color-border-hairline)',
              cursor: 'pointer',
              background: 'var(--color-surface-base)',
              color: 'var(--color-text-primary)',
              flexShrink: 0,
            }}
          >
            Stop
          </button>
        )}
        <button
          type="button"
          onClick={() => void onSend()}
          disabled={pending || !input.trim()}
          style={{
            padding: '9px 14px',
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 10,
            border: 'none',
            cursor: pending || !input.trim() ? 'default' : 'pointer',
            background:
              pending || !input.trim()
                ? 'var(--color-border-hairline)'
                : 'var(--color-cta, #131313)',
            color:
              pending || !input.trim()
                ? 'var(--color-text-tertiary)'
                : 'var(--color-text-inverse, #fff)',
            flexShrink: 0,
          }}
        >
          Send
        </button>
      </div>
    </aside>
  );
}

// ── Message renderer ──────────────────────────────────────────────────────────

/** Compact value formatting for plan diff rows. */
function fmtPlanVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return v.toLocaleString('en-US', { maximumFractionDigits: 4 });
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
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
                      display: 'block',
                      fontSize: 11,
                      fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                      color: 'var(--color-text-tertiary)',
                      marginTop: 2,
                      wordBreak: 'break-word',
                    }}
                  >
                    {c.field}: {fmtPlanVal(c.before)} → {fmtPlanVal(c.after)}
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
        </div>
        <pre
          style={{
            margin: '6px 0',
            padding: '8px 10px',
            fontSize: 11.5,
            lineHeight: 1.5,
            background: 'var(--color-surface-raised, #f7f7f5)',
            borderRadius: 8,
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'var(--color-text-secondary)',
          }}
        >
          {JSON.stringify(c.tool_args, null, 1)}
        </pre>
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
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        margin: '6px 0',
      }}
    >
      <div
        style={{
          maxWidth: '92%',
          padding: isMeta ? '4px 2px' : '8px 12px',
          borderRadius: 12,
          fontSize: isMeta ? 11.5 : 13,
          lineHeight: 1.5,
          // Assistant bubbles render markdown (the renderer owns breaks);
          // user + meta text stays literal.
          whiteSpace: isUser || isMeta ? 'pre-wrap' : 'normal',
          wordBreak: 'break-word',
          background: isUser
            ? 'var(--color-cta, #131313)'
            : isMeta
              ? 'transparent'
              : 'var(--color-surface-raised, #f7f7f5)',
          color: isUser
            ? 'var(--color-text-inverse, #fff)'
            : isMeta
              ? 'var(--color-text-tertiary)'
              : 'var(--color-text-primary)',
          fontStyle: isMeta ? 'italic' : 'normal',
        }}
      >
        {isUser || isMeta ? msg.text : renderMarkdown(msg.text)}
        {msg.writes && msg.writes.length > 0 && (
          <div
            style={{
              marginTop: 8,
              paddingTop: 6,
              borderTop: '1px solid var(--color-border-subtle, #ececea)',
            }}
          >
            {msg.writes.map((w, i) => (
              <div key={i} style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                {w.reverted ? '↩' : '✓'} {w.tool.replaceAll('_', ' ')}
                {w.audit_log_id ? ` · audit ${w.audit_log_id.slice(0, 8)}` : ''}
                {w.reverted ? ' · reverted' : ''}
                {w.entity?.href && (
                  <>
                    {' · '}
                    <Link
                      href={w.entity.href}
                      style={{ color: 'inherit', textDecoration: 'underline' }}
                    >
                      open {w.entity.label ?? ''}
                    </Link>
                  </>
                )}
                {!w.reverted && w.tool === 'update_project' && w.audit_log_id && (
                  <>
                    {' · '}
                    <button
                      type="button"
                      onClick={() => {
                        if (armedRevert === i) {
                          setArmedRevert(null);
                          onRevert(i);
                        } else {
                          setArmedRevert(i);
                        }
                      }}
                      disabled={busy}
                      style={{
                        border: 'none',
                        background: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        fontSize: 11,
                        color: 'inherit',
                        textDecoration: 'underline',
                        fontWeight: armedRevert === i ? 700 : 400,
                      }}
                    >
                      {armedRevert === i ? 'confirm revert' : 'revert'}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        {(msg.toolsUsed?.length || (showCost && msg.costUsd !== undefined)) && (
          <div
            style={{
              marginTop: 6,
              fontSize: 10.5,
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              color: 'var(--color-text-tertiary)',
            }}
          >
            {msg.toolsUsed?.length ? (
              <details style={{ display: 'inline-block' }}>
                <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
                  data: {msg.toolsUsed.length} source{msg.toolsUsed.length === 1 ? '' : 's'}
                </summary>
                {msg.toolsUsed.map((t) => t.replaceAll('_', ' ')).join(' · ')}
              </details>
            ) : null}
            {showCost && msg.costUsd !== undefined && (
              <span style={{ marginLeft: msg.toolsUsed?.length ? 8 : 0 }}>
                ${msg.costUsd.toFixed(2)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared inline styles ──────────────────────────────────────────────────────

const hdrBtn: React.CSSProperties = {
  border: '1px solid var(--color-border-hairline)',
  background: 'var(--color-surface-base)',
  color: 'var(--color-text-secondary)',
  borderRadius: 8,
  padding: '5px 10px',
  fontSize: 12,
  cursor: 'pointer',
  flexShrink: 0,
};

const cardBox: React.CSSProperties = {
  margin: '8px 0',
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid var(--color-border-hairline)',
  background: 'var(--color-surface-base)',
};

const cardLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--color-text-tertiary)',
  marginBottom: 4,
};

const approveBtn: React.CSSProperties = {
  padding: '7px 12px',
  fontSize: 12.5,
  fontWeight: 600,
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  background: 'var(--color-cta, #131313)',
  color: 'var(--color-text-inverse, #fff)',
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
