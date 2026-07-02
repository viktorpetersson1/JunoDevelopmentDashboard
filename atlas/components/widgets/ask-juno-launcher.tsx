'use client';

/**
 * Ask Juno launcher (v2) — the floating bottom-right entry, updated to open the
 * v2 agent RUN CONSOLE instead of the v1 chat. Keeps the familiar launcher (lime
 * circle + JunoMark, the `ja-ask-juno-launcher` idle pulse) and the right-docked
 * panel shell from the v1 widget, but the body is <AgentRunPanel/> — the same
 * durable, resumable console as the /agent page (shared run via localStorage, so
 * a run started on the page also shows here and vice-versa).
 *
 * Replaces AskJunoWidget in app/providers.tsx. The v2 runner is editor+ (D-078);
 * the create-run API enforces it, so a non-editor sees a clear "editors only"
 * note rather than a broken run. v1's "suggest a change" + file-ingest modes are
 * not ported yet (AJ-1 deferred); say the word to bring them across.
 */
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { JunoMark } from '@/components/brand';
import { AgentRunPanel } from '@/app/agent/_components/agent-run-panel';

const PANEL_WIDTH = 440;
const HIDDEN_PREFIXES = ['/sign-in', '/sign-up', '/cleanup'];

export function AskJunoLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Open via the shared event (sidebar CTA / other triggers) + Esc to close.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('atlas:open-ask-juno', onOpen);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('atlas:open-ask-juno', onOpen);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  return (
    <>
      {/* Floating launcher — identical to v1 for muscle-memory continuity. */}
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
        <JunoMark size={28} ariaLabel="Ask Juno" />
      </button>

      {open && (
        <div
          aria-hidden="true"
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 1090 }}
        />
      )}

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
          background: 'var(--color-surface-base, #fff)',
          borderLeft: '1px solid var(--color-border-hairline, #c8c8c5)',
          boxShadow: '-12px 0 32px rgba(17, 17, 17, 0.08)',
          zIndex: 1100,
          transform: open ? 'translateX(0)' : `translateX(${PANEL_WIDTH + 24}px)`,
          transition: 'transform 220ms cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid var(--color-border-hairline, #c8c8c5)',
            flex: '0 0 auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <JunoMark size={20} ariaLabel="Juno" />
            <strong style={{ fontSize: 14, color: 'var(--color-text-primary, #111)' }}>
              Ask Juno
            </strong>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close Ask Juno"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-tertiary, #767b84)',
              fontSize: 18,
              lineHeight: 1,
              padding: 4,
            }}
          >
            ✕
          </button>
        </header>

        {/* The v2 run console. Only mount it while open so it doesn't fetch/replay
            in the background on every page. Shares the run with /agent via localStorage. */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>{open && <AgentRunPanel />}</div>
      </aside>
    </>
  );
}
