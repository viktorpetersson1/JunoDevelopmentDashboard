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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { JunoMark } from '@/components/brand';

type Mode = 'question' | 'suggest';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  ts: number;
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

  const onSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || pending) return;

    const userMsg: ChatMessage = { role: 'user', text: trimmed, ts: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setPending(true);

    try {
      const endpoint = mode === 'suggest' ? '/api/suggestions' : '/api/ask-juno';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: trimmed,
          // Pass the current pathname so server-side handlers can scope
          // context (e.g. "user is on /projects/p2 — they probably mean
          // this project").
          pathname,
        }),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
        const errText =
          (detail as { error?: { message?: string } })?.error?.message ??
          `Request failed (HTTP ${res.status}).`;
        setMessages((m) => [...m, { role: 'system', text: errText, ts: Date.now() }]);
        return;
      }

      const json = (await res.json()) as {
        data?: { reply?: string; status?: string; id?: string };
      };
      const reply =
        json.data?.reply ??
        (mode === 'suggest'
          ? json.data?.id
            ? 'Your suggestion has been queued for review.'
            : 'Sent — admin will review.'
          : '(empty response)');
      setMessages((m) => [...m, { role: 'assistant', text: reply, ts: Date.now() }]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Network error.';
      setMessages((m) => [
        ...m,
        { role: 'system', text: `Couldn't reach Juno: ${errMsg}`, ts: Date.now() },
      ]);
    } finally {
      setPending(false);
    }
  }, [input, pending, mode, pathname]);

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
      {/* Floating launcher — fixed bottom-right, always visible (except auth pages) */}
      <button
        type="button"
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
            <MessageRow key={i} message={m} />
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
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyInInput}
            placeholder={
              mode === 'question'
                ? 'Ask about projects, KPIs, or framework…'
                : 'Propose a change for an admin to review…'
            }
            rows={2}
            disabled={pending}
            style={{
              flex: 1,
              padding: '8px 10px',
              fontSize: 13,
              border: '1px solid var(--color-border-hairline)',
              borderRadius: 8,
              background: 'var(--color-surface-base)',
              color: 'var(--color-text-primary)',
              resize: 'none',
              fontFamily: 'inherit',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
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
                border: '1px solid var(--color-border-hairline)',
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

function MessageRow({ message }: { message: ChatMessage }) {
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
