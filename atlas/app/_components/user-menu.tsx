'use client';

/**
 * UserMenu — round avatar button + dropdown for Settings + Sign out.
 *
 * Lives in the topbar (right cluster, after the scenario picker) per
 * Viktor's 2-Jun visual feedback. Replaces the dead sidebar-footer chip
 * which had role="button" but no onClick.
 *
 * Avatar: deterministic monogram (first letter of display name) on a
 * near-black circle, white text, focus ring on keyboard nav.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export interface UserMenuProps {
  /** Display name shown in the dropdown header. */
  name: string;
  /** Email shown under the name. */
  email: string;
}

export function UserMenu({ name, email }: UserMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click + Esc.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleSignOut = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
    } catch {
      // ignore — hard-navigate anyway so the session cookie is reset
    }
    router.push('/sign-in');
    router.refresh();
  }, [busy, router]);

  const initial = (name.trim()[0] ?? '?').toUpperCase();

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-label={`${name} account menu`}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          background: 'var(--color-text-primary, #0d0d0d)',
          color: 'var(--color-text-inverse, #fff)',
          border: 'none',
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          transition: 'transform 80ms ease, box-shadow 120ms ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-surface-muted, #f4f4f2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            minWidth: 240,
            background: 'var(--color-surface-base, #fff)',
            border: '1px solid var(--color-border-hairline, #c8c8c5)',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(17,17,17,0.10)',
            padding: 6,
            zIndex: 60,
          }}
        >
          {/* Header: identity */}
          <div
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid var(--color-border-subtle, #f4f4f2)',
              marginBottom: 4,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--color-text-primary, #111)',
              }}
            >
              {name}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--color-text-tertiary, #767b84)',
                marginTop: 2,
                wordBreak: 'break-all',
              }}
            >
              {email}
            </div>
          </div>

          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            style={menuItemStyle}
          >
            Settings
          </Link>
          <Link
            href="/notifications"
            role="menuitem"
            onClick={() => setOpen(false)}
            style={menuItemStyle}
          >
            Notifications
          </Link>
          <div
            style={{
              height: 1,
              margin: '4px 8px',
              background: 'var(--color-border-subtle, #f4f4f2)',
            }}
          />
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={busy}
            style={{
              ...menuItemStyle,
              width: '100%',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              cursor: busy ? 'wait' : 'pointer',
              color: 'var(--color-negative, #b91c1c)',
            }}
          >
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: 'block',
  padding: '8px 12px',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--color-text-primary, #111)',
  textDecoration: 'none',
  cursor: 'pointer',
};
