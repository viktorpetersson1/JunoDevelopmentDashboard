'use client';

/**
 * V4.1 — Ask Juno widget (INVENTORY §28).
 *
 * Global widget mounted in app/providers.tsx so it's available on every
 * authenticated page. Two visual elements:
 *   - Floating bottom-right launcher button (fixed position, brand mark).
 *   - Right-docked overlay panel (slides in from the right) when open.
 *
 * Modes:
 *   - Question: free-form Q&A; POST /api/ask-juno → returns assistant text.
 *   - Suggest a change: posts to /api/suggestions (V4.8) for editor review;
 *     today shows a "queued for review" toast since the queue ships in V4.8.
 *
 * Hidden on /sign-in + /sign-up + /sign-out (no chat surface on auth pages).
 *
 * Why this lives in providers.tsx (a client boundary) and not in
 * app/layout.tsx (a Server Component): the launcher is interactive +
 * stateful, can't be a Server Component, but should be mounted once
 * globally rather than per-page.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { JunoMark } from '@/components/brand';

type Mode = 'question' | 'suggest';

interface ConfirmationCard {
  tool_name: string;
  tool_use_id?: string;
  tool_args: Record<string, unknown>;
  preamble?: string;
  reason: string;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool_status' | 'confirmation';
  text: string;
  ts: number;
  /** Present when role === 'confirmation' — the pending proposal card. */
  confirmation?: ConfirmationCard;
  /** Present when role === 'tool_status' — the tool being executed. */
  tool_name?: string;
  /** Audit log id after successful write. */
  audit_log_id?: string | null;
}

const PANEL_WIDTH = 400;

// Routes where the widget should NOT mount (auth shells, error pages).
const HIDDEN_ON = ['/sign-in', '/sign-up'];

export function AskJunoWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('question');
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /** Handle file upload for T116 ingest. */
  const onFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset so same file can be re-selected

    const statusMsg: ChatMessage = {
      role: 'tool_status',
      text: `Uploading ${file.name}…`,
      ts: Date.now(),
    };
    setMessages((m) => [...m, statusMsg]);
    setPending(true);

    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/ask-juno/ingest', { method: 'POST', body: form });
      const json = (await res.json().catch(() => null)) as {
        data?: {
          type?: string;
          text?: string;
          file_name?: string;
          confidence?: number;
          by_category?: Record<string, { count: number; total_usd: number }>;
          total_items?: number;
          total_usd?: number;
          warnings?: string[];
          uncategorized_count?: number;
          line_items?: unknown[];
        };
        error?: { message?: string };
      } | null;

      if (!res.ok) {
        setMessages((m) =>
          m.map((msg) =>
            msg === statusMsg
              ? {
                  ...msg,
                  role: 'system' as const,
                  text: json?.error?.message ?? `Upload failed (HTTP ${res.status})`,
                }
              : msg
          )
        );
        return;
      }

      const d = json?.data;
      if (d?.type === 'ingest_error') {
        setMessages((m) =>
          m.map((msg) =>
            msg === statusMsg
              ? { ...msg, role: 'system' as const, text: d.text ?? 'Extraction failed' }
              : msg
          )
        );
        return;
      }

      if (d?.type === 'ingest_proposal') {
        const categories = Object.entries(d.by_category ?? {})
          .map(
            ([cat, v]) => `${v.count} items → ${cat} $${Math.round(v.total_usd).toLocaleString()}`
          )
          .join('\n');
        const summaryText = [
          `📄 ${d.file_name} — ${d.total_items} items · $${Math.round(d.total_usd ?? 0).toLocaleString()} · confidence ${Math.round((d.confidence ?? 0) * 100)}%`,
          categories,
          d.uncategorized_count ? `${d.uncategorized_count} items uncategorised` : null,
          d.warnings?.length ? `Warnings: ${d.warnings.join('; ')}` : null,
        ]
          .filter(Boolean)
          .join('\n');

        setMessages((m) =>
          m.map((msg) =>
            msg === statusMsg
              ? {
                  ...msg,
                  role: 'assistant' as const,
                  text:
                    summaryText +
                    '\n\nReview in the Actuals tab to commit — go to the project and use Import CSV.',
                }
              : msg
          )
        );
        return;
      }

      setMessages((m) =>
        m.map((msg) =>
          msg === statusMsg
            ? {
                ...msg,
                role: 'system' as const,
                text: d?.text ?? 'Unexpected response from ingest',
              }
            : msg
        )
      );
    } catch (err) {
      setMessages((m) =>
        m.map((msg) =>
          msg === statusMsg
            ? {
                ...msg,
                role: 'system' as const,
                text: `Upload error: ${err instanceof Error ? err.message : 'Network error'}`,
              }
            : msg
        )
      );
    } finally {
      setPending(false);
    }
  }, []);

  // Hide on auth pages.
  const hidden = useMemo(
    () => HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`)),
    [pathname]
  );

  // Auto-scroll the chat log to the latest message.
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length, pending]);

  // Focus the input when the panel opens.
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // V4.1b — listen for the sidebar CTA's open event. AppShell.tsx exports
  // the event name as ASK_JUNO_OPEN_EVENT; consumers can dispatch it from
  // anywhere (sidebar item, future deep-link, in-page CTA buttons, etc.).
  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener('atlas:open-ask-juno', onOpen);
    return () => window.removeEventListener('atlas:open-ask-juno', onOpen);
  }, []);

  /** Call the ask-juno agent with full conversation history. */
  const callAgent = useCallback(
    async (userText: string, history: ChatMessage[], confirmedTool?: ConfirmationCard) => {
      setPending(true);
      try {
        // Build Anthropic-compatible messages from history (user + assistant only).
        const anthropicMessages = history
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role, content: m.text }));

        const body: Record<string, unknown> = {
          messages: anthropicMessages,
          pathname,
        };

        if (confirmedTool) {
          body.confirmed_tool = {
            name: confirmedTool.tool_name,
            args: confirmedTool.tool_args,
            tool_use_id: confirmedTool.tool_use_id,
          };
        }

        const res = await fetch('/api/ask-juno', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const detail = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          const errText = detail?.error?.message ?? `Request failed (HTTP ${res.status}).`;
          setMessages((m) => [...m, { role: 'system', text: errText, ts: Date.now() }]);
          return;
        }

        const json = (await res.json()) as {
          data?: {
            type?: string;
            text?: string;
            tool_name?: string;
            tool_use_id?: string;
            tool_args?: Record<string, unknown>;
            preamble?: string;
            reason?: string;
            audit_log_id?: string | null;
          };
        };
        const d = json.data;

        if (!d) {
          setMessages((m) => [...m, { role: 'system', text: '(empty response)', ts: Date.now() }]);
          return;
        }

        if (d.type === 'reply' || d.type === 'error') {
          setMessages((m) => [
            ...m,
            { role: 'assistant', text: d.text ?? '(no reply)', ts: Date.now() },
          ]);
          return;
        }

        if (d.type === 'pending_confirmation' && d.tool_name && d.tool_args) {
          // Show preamble (if any) + the proposal card.
          const newMsgs: ChatMessage[] = [];
          if (d.preamble) newMsgs.push({ role: 'assistant', text: d.preamble, ts: Date.now() });
          newMsgs.push({
            role: 'confirmation',
            text: '',
            ts: Date.now(),
            confirmation: {
              tool_name: d.tool_name,
              tool_use_id: d.tool_use_id,
              tool_args: d.tool_args,
              preamble: d.preamble,
              reason: d.reason ?? '',
            },
          });
          setMessages((m) => [...m, ...newMsgs]);
          return;
        }

        if (d.type === 'tool_executed') {
          setMessages((m) => [
            ...m,
            {
              role: 'assistant',
              text: d.text ?? 'Done.',
              ts: Date.now(),
              audit_log_id: d.audit_log_id,
              tool_name: d.tool_name,
            },
          ]);
          return;
        }

        // Fallback.
        setMessages((m) => [
          ...m,
          { role: 'assistant', text: d.text ?? '(no reply)', ts: Date.now() },
        ]);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Network error.';
        setMessages((m) => [
          ...m,
          { role: 'system', text: `Couldn't reach Juno: ${errMsg}`, ts: Date.now() },
        ]);
      } finally {
        setPending(false);
      }
    },
    [pathname]
  );

  const onSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || pending) return;

    const userMsg: ChatMessage = { role: 'user', text: trimmed, ts: Date.now() };
    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    setInput('');

    if (mode === 'suggest') {
      // Suggest mode still goes to the existing /api/suggestions queue.
      setPending(true);
      try {
        const res = await fetch('/api/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: trimmed, pathname }),
        });
        const json = (await res.json().catch(() => null)) as { data?: { id?: string } } | null;
        const reply = json?.data?.id
          ? 'Your suggestion has been queued for review.'
          : 'Sent — admin will review.';
        setMessages((m) => [...m, { role: 'assistant', text: reply, ts: Date.now() }]);
      } catch (err) {
        setMessages((m) => [
          ...m,
          {
            role: 'system',
            text: `Couldn't queue suggestion: ${err instanceof Error ? err.message : 'Network error'}`,
            ts: Date.now(),
          },
        ]);
      } finally {
        setPending(false);
      }
      return;
    }

    await callAgent(trimmed, updatedHistory);
  }, [input, pending, mode, pathname, messages, callAgent]);

  /** User clicked Confirm on a proposal card. */
  const onConfirm = useCallback(
    async (card: ConfirmationCard) => {
      // Replace the confirmation card with a "executing…" status row.
      setMessages((m) =>
        m.map((msg) =>
          msg.confirmation === card
            ? {
                ...msg,
                role: 'tool_status' as const,
                tool_name: card.tool_name,
                confirmation: undefined,
                text: `Executing ${card.tool_name}…`,
              }
            : msg
        )
      );
      // Build history up to (not including) the confirmation card.
      const history = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
      await callAgent('', history, card);
    },
    [messages, callAgent]
  );

  /** User clicked Cancel on a proposal card. */
  const onCancel = useCallback((card: ConfirmationCard) => {
    setMessages((m) =>
      m.map((msg) =>
        msg.confirmation === card
          ? {
              ...msg,
              role: 'system' as const,
              confirmation: undefined,
              text: `Cancelled: ${card.tool_name}`,
            }
          : msg
      )
    );
  }, []);

  function onKeyInInput(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter to send, Shift+Enter for newline (matches Slack/ChatGPT convention).
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void onSend();
    }
  }

  if (hidden) return null;

  return (
    <>
      {/* Floating launcher — fixed bottom-right, always visible (except auth pages).
          V5.2 feedback (Viktor 2 Jun): added breathing pulse + metallic shimmer via
          .ja-ask-juno-launcher (patterns.css) so users see it's alive. Animation
          pauses on hover/focus and respects prefers-reduced-motion. */}
      <button
        type="button"
        className={open ? undefined : 'ja-ask-juno-launcher'}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close Ask Juno' : 'Open Ask Juno'}
        aria-expanded={open}
        aria-controls="ask-juno-panel"
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 1100,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--color-accent-lime, #ddec65)',
          color: 'var(--color-text-on-lime, #0d0d0d)',
          border: '1px solid var(--color-accent-lime-pressed, #c5d44c)',
          boxShadow: '0 8px 24px rgba(17, 17, 17, 0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'transform 80ms ease, box-shadow 180ms ease',
        }}
      >
        <JunoMark size={28} ariaLabel="Ask Juno" animated={pending} />
      </button>

      {/* Backdrop — soft dim when the panel is open. Click to dismiss. */}
      {open && (
        <div
          aria-hidden="true"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.18)',
            zIndex: 1090,
            transition: 'opacity 180ms ease',
          }}
        />
      )}

      {/* Right-docked panel */}
      <aside
        id="ask-juno-panel"
        role="dialog"
        aria-label="Ask Juno"
        aria-hidden={!open}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: PANEL_WIDTH,
          maxWidth: '100vw',
          background: 'var(--color-surface-base, #ffffff)',
          borderLeft: '1px solid var(--color-border-hairline, #c8c8c5)',
          boxShadow: '-12px 0 32px rgba(17, 17, 17, 0.08)',
          zIndex: 1100,
          transform: open ? 'translateX(0)' : `translateX(${PANEL_WIDTH + 24}px)`,
          transition: 'transform 220ms cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)',
            background: 'var(--color-surface-base, #ffffff)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <JunoMark size={20} ariaLabel="Juno" />
            <strong style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>Ask Juno</strong>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close Ask Juno"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-tertiary)',
              padding: 4,
              display: 'inline-flex',
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {/* Mode toggle */}
        <div
          role="tablist"
          aria-label="Ask Juno mode"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 0,
            padding: '8px 12px 0',
            background: 'var(--color-surface-base)',
          }}
        >
          {(['question', 'suggest'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              style={{
                padding: '8px 10px',
                fontSize: 12,
                fontWeight: 400,
                border: 'none',
                borderBottom:
                  mode === m ? '2px solid var(--color-text-primary)' : '2px solid transparent',
                background: 'transparent',
                color: mode === m ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                cursor: 'pointer',
              }}
            >
              {m === 'question' ? 'Question' : 'Suggest a change'}
            </button>
          ))}
        </div>

        {/* Chat log */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 16px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            background: 'var(--color-surface-sunken, #fafaf8)',
          }}
        >
          {messages.length === 0 && <EmptyState mode={mode} pathname={pathname} />}
          {messages.map((m, i) => (
            <MessageRow key={i} message={m} onConfirm={onConfirm} onCancel={onCancel} />
          ))}
          {pending && <ThinkingRow />}
        </div>

        {/* Composer */}
        <div
          style={{
            padding: 12,
            borderTop: '1px solid var(--color-border-hairline)',
            background: 'var(--color-surface-base)',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
          }}
        >
          {/* Hidden file input for T116 ingest */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.pdf,.docx"
            onChange={onFileChange}
            style={{ display: 'none' }}
          />
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyInInput}
            placeholder={
              mode === 'question'
                ? 'Ask about projects, KPIs, or upload a file…'
                : 'Propose a change for an admin to review…'
            }
            rows={2}
            disabled={pending}
            style={{
              flex: 1,
              padding: '8px 10px',
              fontSize: 13,
              border: 'var(--ja-card-border)',
              borderRadius: 8,
              background: 'var(--color-surface-base)',
              color: 'var(--color-text-primary)',
              resize: 'none',
              fontFamily: 'inherit',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {mode === 'question' && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={pending}
              aria-label="Upload file (CSV or PDF)"
              title="Upload CSV / PDF for extraction"
              style={{
                width: 36,
                height: 36,
                fontSize: 16,
                border: 'var(--ja-card-border)',
                borderRadius: 8,
                background: 'var(--color-surface-base)',
                cursor: pending ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: 'var(--color-text-tertiary)',
              }}
            >
              📎
            </button>
          )}
          <button
            type="button"
            onClick={onSend}
            disabled={pending || !input.trim()}
            aria-label="Send"
            style={{
              padding: '0 14px',
              height: 36,
              fontSize: 12,
              fontWeight: 400,
              color: '#fff',
              background: 'var(--color-accent-base, #131313)',
              border: 'none',
              borderRadius: 8,
              cursor: pending || !input.trim() ? 'not-allowed' : 'pointer',
              opacity: pending || !input.trim() ? 0.5 : 1,
            }}
          >
            {pending ? '…' : 'Send'}
          </button>
        </div>
      </aside>
    </>
  );
}

function EmptyState({ mode, pathname }: { mode: Mode; pathname: string }) {
  const nudges =
    mode === 'question'
      ? [
          `What's the IRR on this portfolio?`,
          `Which projects are at risk of slipping?`,
          `Explain the latest pricing run.`,
          pathname.startsWith('/projects/')
            ? `Summarize this project's risks.`
            : `Show me the project with the highest margin.`,
        ]
      : [
          'Raise the target margin on Project 4 to 30%.',
          'Add a new market for Shelter Island.',
          'Set the LOC facility to $8M.',
        ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>
        {mode === 'question'
          ? 'Ask Juno anything about your portfolio.'
          : 'Suggest a change — an admin will review before it lands.'}
      </p>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {nudges.map((n, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => {
                const el = document.querySelector<HTMLTextAreaElement>('#ask-juno-panel textarea');
                if (el) {
                  el.value = n;
                  // Fire input event so React state syncs.
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.focus();
                }
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                fontSize: 12,
                background: 'var(--color-surface-base)',
                border: 'var(--ja-card-border)',
                borderRadius: 8,
                color: 'var(--color-text-primary)',
                cursor: 'pointer',
              }}
            >
              {n}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MessageRow({
  message,
  onConfirm,
  onCancel,
}: {
  message: ChatMessage;
  onConfirm: (card: ConfirmationCard) => void;
  onCancel: (card: ConfirmationCard) => void;
}) {
  // Confirmation card (T115 §2.5 proposal card pattern).
  if (message.role === 'confirmation' && message.confirmation) {
    return (
      <ConfirmationCardRow card={message.confirmation} onConfirm={onConfirm} onCancel={onCancel} />
    );
  }

  // Tool execution status.
  if (message.role === 'tool_status') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 0',
          fontSize: 12,
          color: 'var(--color-text-tertiary)',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--color-warning, #a16207)',
            display: 'inline-block',
          }}
        />
        {message.text}
      </div>
    );
  }

  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <div
        style={{
          maxWidth: '85%',
          padding: '8px 12px',
          borderRadius: 10,
          fontSize: 13,
          lineHeight: 1.45,
          background: isUser
            ? 'var(--color-accent-lime, #ddec65)'
            : isSystem
              ? 'var(--color-warning-soft, #fefce8)'
              : 'var(--color-surface-base)',
          color: isUser
            ? 'var(--color-text-on-lime, #0d0d0d)'
            : isSystem
              ? 'var(--color-warning, #a16207)'
              : 'var(--color-text-primary)',
          border: isUser
            ? '1px solid var(--color-accent-lime-pressed)'
            : '1px solid var(--color-border-hairline)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {message.text}
        {message.audit_log_id && (
          <div
            style={{
              marginTop: 4,
              fontSize: 10,
              color: 'var(--color-text-tertiary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            audit: {message.audit_log_id.slice(0, 8)}…
          </div>
        )}
      </div>
    </div>
  );
}

/** T115 §2.5 — Confirmation card (proposal card the user clicks to approve). */
function ConfirmationCardRow({
  card,
  onConfirm,
  onCancel,
}: {
  card: ConfirmationCard;
  onConfirm: (c: ConfirmationCard) => void;
  onCancel: (c: ConfirmationCard) => void;
}) {
  const [confirming, setConfirming] = React.useState(false);
  const TOOL_LABELS: Record<string, string> = {
    create_project: 'Create project',
    update_project: 'Update project',
    create_actuals_entry: 'Log actuals entry',
    create_risk: 'Log risk',
  };
  const label = TOOL_LABELS[card.tool_name] ?? card.tool_name;

  return (
    <div
      style={{
        background: 'var(--color-surface-base)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 10,
        padding: 14,
        fontSize: 13,
        maxWidth: '90%',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--color-text-primary)' }}>
        Ask Juno proposes: {label}
      </div>
      <ul
        style={{
          margin: '0 0 10px',
          padding: '0 0 0 16px',
          fontSize: 12,
          color: 'var(--color-text-secondary)',
          lineHeight: 1.6,
        }}
      >
        {Object.entries(card.tool_args).map(([k, v]) => (
          <li key={k}>
            <strong>{k.replace(/_/g, ' ')}:</strong> {String(v)}
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          disabled={confirming}
          onClick={() => {
            setConfirming(true);
            onConfirm(card);
          }}
          style={{
            padding: '5px 14px',
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 6,
            background: 'var(--color-accent-lime, #ddec65)',
            border: '1px solid var(--color-accent-lime-pressed)',
            cursor: confirming ? 'wait' : 'pointer',
            color: '#0d0d0d',
          }}
        >
          {confirming ? 'Executing…' : 'Confirm'}
        </button>
        <button
          type="button"
          disabled={confirming}
          onClick={() => onCancel(card)}
          style={{
            padding: '5px 14px',
            fontSize: 12,
            borderRadius: 6,
            background: 'none',
            border: '1px solid var(--color-border-hairline)',
            cursor: 'pointer',
            color: 'var(--color-text-secondary)',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ThinkingRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px' }}>
      <JunoMark size={16} animated />
      <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Juno is thinking…</span>
    </div>
  );
}
