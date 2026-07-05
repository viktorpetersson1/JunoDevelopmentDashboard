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
import { JunoMark } from '@/components/brand';

const PANE_WIDTH = 440;
const SHIFT_MIN_VIEWPORT = 1180; // below this, overlay instead of pushing content
const STORAGE_KEY = 'aj-v3-conversation';
const HIDDEN_ON = ['/sign-in', '/sign-up'];
const HISTORY_SEND_CAP = 40;

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
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool_status' | 'confirmation' | 'question';
  text: string;
  ts: number;
  confirmation?: ConfirmationCard;
  question?: QuestionCard;
  writes?: ExecutedWrite[];
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
        const saved = JSON.parse(raw) as { messages?: ChatMessage[]; open?: boolean };
        if (Array.isArray(saved.messages)) setMessages(saved.messages.slice(-120));
        if (saved.open) setOpen(true);
      }
    } catch {
      /* corrupt state — start fresh */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: messages.slice(-120), open }));
    } catch {
      /* quota — non-critical */
    }
  }, [messages, open]);

  // ── Content shift (the "pane" behaviour) ────────────────────────────────
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    const apply = () => {
      const shift = open && !hidden && window.innerWidth >= SHIFT_MIN_VIEWPORT;
      body.style.transition = 'padding-right 200ms ease';
      body.style.paddingRight = shift ? `${PANE_WIDTH}px` : '';
    };
    apply();
    window.addEventListener('resize', apply);
    return () => {
      window.removeEventListener('resize', apply);
      body.style.paddingRight = '';
    };
  }, [open, hidden]);

  // ── Open/close plumbing ─────────────────────────────────────────────────
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('atlas:open-ask-juno', onOpen);
    return () => window.removeEventListener('atlas:open-ask-juno', onOpen);
  }, []);
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
    kind: 'confirmed_tool' | 'declined_tool' | 'answered_question';
    tool_use_id: string;
    name: string;
    args: Record<string, unknown>;
    answer?: string;
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

  const callAgent = useCallback(
    async (history: ChatMessage[], resume?: Resume) => {
      setPending(true);
      try {
        const res = await fetch('/api/ask-juno', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: historyForSend(history), pathname, resume }),
        });
        const json = (await res.json().catch(() => null)) as {
          data?: {
            type?: string;
            text?: string;
            tool_name?: string;
            tool_use_id?: string;
            tool_args?: Record<string, unknown>;
            reason?: string;
            preamble?: string;
            question?: string;
            options?: Array<{ label: string; description?: string }>;
            executed_writes?: ExecutedWrite[];
          };
          error?: { message?: string };
        } | null;

        if (!res.ok) {
          push({
            role: 'system',
            text: json?.error?.message ?? `Request failed (HTTP ${res.status}).`,
          });
          return;
        }
        const d = json?.data;
        if (!d) {
          push({ role: 'system', text: '(empty response)' });
          return;
        }

        const writes = d.executed_writes?.length ? d.executed_writes : undefined;

        if (d.type === 'reply' || d.type === 'error') {
          push({ role: 'assistant', text: d.text ?? '(no reply)', writes });
          return;
        }

        if (d.type === 'ask_user' && d.tool_use_id) {
          if (d.preamble) push({ role: 'assistant', text: d.preamble, writes });
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
          if (d.preamble) push({ role: 'assistant', text: d.preamble, writes });
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

        push({ role: 'assistant', text: d.text ?? '(no reply)', writes });
      } catch (err) {
        push({
          role: 'system',
          text: `Couldn't reach Juno: ${err instanceof Error ? err.message : 'network error'}`,
        });
      } finally {
        setPending(false);
      }
    },
    [historyForSend, pathname, push]
  );

  // ── Send / resume actions ───────────────────────────────────────────────

  const onSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || pending) return;
    const suffix = attachments.length
      ? attachments.map((a) => `[attachment:${a.id} ${a.fileName} — ${a.rowCount} rows]`).join('\n')
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
    await callAgent(updated);
  }, [input, pending, attachments, messages, callAgent]);

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

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';
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

  const newChat = useCallback(() => {
    setMessages([]);
    setAttachments([]);
    setInput('');
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
        width: PANE_WIDTH,
        maxWidth: '100vw',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-surface-base, #ffffff)',
        borderLeft: '1px solid var(--color-border-hairline, #e5e5e2)',
        boxShadow: '-8px 0 24px rgba(0,0,0,0.06)',
        zIndex: 60,
      }}
    >
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

      {/* Messages */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
        {messages.length === 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', lineHeight: 1.6 }}>
            <p style={{ margin: '0 0 10px' }}>Things you can ask me to do:</p>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              <li>
                &ldquo;What&rsquo;s our 90-day cash requirement and which project drives it?&rdquo;
              </li>
              <li>&ldquo;Update 84 Sunset Beach Road&rsquo;s target sale price to $8.2M&rdquo;</li>
              <li>&ldquo;Archive the North Haven project&rdquo;</li>
              <li>Attach an Excel sheet → &ldquo;update the platform with these figures&rdquo;</li>
              <li>&ldquo;What did we decide about 72 South Ferry in the last meeting?&rdquo;</li>
            </ul>
            <p style={{ margin: '10px 0 0' }}>
              Changes always show a confirmation card first. When something&rsquo;s ambiguous,
              I&rsquo;ll ask with options.
            </p>
          </div>
        )}

        {messages.map((m) => (
          <MessageRow
            key={m.id}
            msg={m}
            busy={pending}
            onConfirm={(approved) => void resolveConfirmation(m.id, approved)}
            onAnswer={(answer) => void answerQuestion(m.id, answer)}
          />
        ))}

        {pending && (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '6px 0' }}>
            Juno is working…
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

function MessageRow({
  msg,
  busy,
  onConfirm,
  onAnswer,
}: {
  msg: ChatMessage;
  busy: boolean;
  onConfirm: (approved: boolean) => void;
  onAnswer: (answer: string) => void;
}) {
  const [freeText, setFreeText] = useState('');

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
          whiteSpace: 'pre-wrap',
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
        {msg.text}
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
                ✓ {w.tool.replaceAll('_', ' ')}
                {w.audit_log_id ? ` · audit ${w.audit_log_id.slice(0, 8)}` : ''}
              </div>
            ))}
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
