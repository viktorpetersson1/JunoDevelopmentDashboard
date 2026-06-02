'use client';

/**
 * V4.12 — Active scenario picker (topbar).
 *
 * Dropdown that lists "Base case" + all saved scenarios from
 * atlas.scenarios. On select, POSTs to /api/scenarios/active to update
 * the cookie, then triggers a router refresh so Server Components
 * re-render with the new active scenario.
 *
 * The cookie is the single source of truth for "what scenario am I
 * viewing" across pages; this component just lets the user change it.
 *
 * Defensive UX:
 *   - Disabled state while a request is in flight (no double-clicks)
 *   - Visible error text on failure (no silent rejection)
 *   - Falls back to "Base case" if the active id was deleted
 */

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface ScenarioOption {
  id: string;
  name: string;
  class: string;
  locked: boolean;
}

interface Props {
  /** Initial active scenario id (read from cookie server-side), or null for base. */
  initialActiveId: string | null;
  /** Initial display label so the picker doesn't flicker on first render. */
  initialDisplayName: string;
}

export function ActiveScenarioPicker({ initialActiveId, initialDisplayName }: Props) {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(initialActiveId);
  const [activeName, setActiveName] = useState<string>(initialDisplayName);
  const [options, setOptions] = useState<ScenarioOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Fetch the list on first open — keeps the topbar render light when
  // the picker is closed.
  useEffect(() => {
    if (!open || options.length > 0) return;
    setLoading(true);
    setError(null);
    fetch('/api/scenarios', { headers: { Accept: 'application/json' } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return (await res.json()) as { scenarios: ScenarioOption[] };
      })
      .then((body) => setOptions(body.scenarios))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [open, options.length]);

  // Close on Escape / outside-click. Simple inline handler; doesn't need
  // a full popover library for one dropdown.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const choose = (id: string | null, name: string) => {
    setError(null);
    setOpen(false);
    setLoading(true);
    fetch('/api/scenarios/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const e = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(e?.error?.message ?? `${res.status} ${res.statusText}`);
        }
        return (await res.json()) as { active: string | null; displayName: string };
      })
      .then((body) => {
        setActive(body.active);
        setActiveName(body.displayName);
        // Server Components re-render against the new cookie.
        startTransition(() => router.refresh());
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        // Roll back optimistic UI.
        setActiveName(activeName);
      })
      .finally(() => setLoading(false));
    // Best-effort optimistic update so the button text flips immediately.
    setActiveName(name);
  };

  const isBase = active === null;

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={loading || pending}
        title="Active scenario"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          fontSize: 12,
          fontWeight: 400,
          borderRadius: 999,
          border: '1px solid var(--color-border-hairline)',
          background: isBase ? 'var(--color-surface-base)' : 'var(--color-accent-lime, #ddec65)',
          color: isBase ? 'var(--color-text-primary)' : 'var(--color-text-on-lime, #0d0d0d)',
          cursor: loading || pending ? 'wait' : 'pointer',
        }}
      >
        <span style={{ fontSize: 10, opacity: 0.7 }}>Scenario:</span>
        <span
          style={{
            maxWidth: 140,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {activeName}
        </span>
        <span style={{ fontSize: 10, opacity: 0.6 }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 240,
            background: 'var(--color-surface-base)',
            border: '1px solid var(--color-border-hairline)',
            borderRadius: 10,
            padding: 4,
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            zIndex: 50,
          }}
        >
          <PickerOption
            label="Base case"
            sublabel="Constants from baselines.ts"
            active={isBase}
            onClick={() => choose(null, 'Base case')}
          />
          {loading && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              Loading…
            </div>
          )}
          {!loading && options.length === 0 && !error && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              No saved scenarios yet. Build one at <code>/scenario</code>.
            </div>
          )}
          {options.map((o) => (
            <PickerOption
              key={o.id}
              label={o.name}
              sublabel={`${o.class}${o.locked ? ' · 🔒 locked' : ''}`}
              active={active === o.id}
              onClick={() => choose(o.id, o.name)}
            />
          ))}
          {error && (
            <div
              role="alert"
              style={{
                padding: '8px 12px',
                fontSize: 11,
                color: 'var(--color-negative, #b91c1c)',
                background: 'var(--color-negative-soft, #fef2f2)',
                borderTop: '1px solid var(--color-border-hairline)',
                marginTop: 4,
              }}
            >
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PickerOption({
  label,
  sublabel,
  active,
  onClick,
}: {
  label: string;
  sublabel?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        width: '100%',
        textAlign: 'left',
        padding: '8px 12px',
        background: active ? 'var(--color-surface-sunken, #f7f7f7)' : 'transparent',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 13,
        color: 'var(--color-text-primary)',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span
          style={{
            fontWeight: active ? 600 : 400,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
        {sublabel && (
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{sublabel}</span>
        )}
      </div>
      {active && <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>✓</span>}
    </button>
  );
}
