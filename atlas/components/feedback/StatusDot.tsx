'use client';

/**
 * StatusDot — V6.1 T113. Pulsating-dot severity indicator.
 *
 * Replaces all inline alert banners + YoY delta tags platform-wide:
 *   - /pricing stale-data banner → amber dot next to "Market intelligence"
 *   - KPI YoY tags              → dot; suppressed when delta === 0
 *   - Project re-approval chip  → amber dot in project header
 *   - Home capital-call-overdue → (wired in T110)
 *
 * DR-5 (palette resolution): uses existing COLOR_TOKENS rather than the
 * slightly different hexes in the V6.1 doc (#D4A017 / #C0392B).
 * Existing tokens: warning #a16207, negative/error #b91c1c, info #0D0D0D.
 *
 * Hard Rule #3: no new UI library — composed entirely from ja-* primitives
 * and inline styles.
 */

import { useCallback, useRef, useState, type ReactNode } from 'react';
import './feedback.css';

// ── Types ────────────────────────────────────────────────────────────────────

export type StatusDotSeverity = 'info' | 'warning' | 'error';

export interface StatusDotProps {
  severity: StatusDotSeverity;
  /** Bold title shown in the popover. */
  title: string;
  /** Body copy in the popover. */
  message: string;
  /** Optional CTA rendered in the popover. */
  action?: { label: string; href?: string; onClick?: () => void };
  /** ISO timestamp — rendered as "noticed Xh ago". */
  timestamp?: string;
  /**
   * When provided, the dot renders nothing if this value === 0 or is
   * non-finite. Used for KPI YoY tags: suppressIfZero={delta ?? 0}.
   */
  suppressIfZero?: number;
  className?: string;
  /** Optional adjacent text rendered inline next to the dot. */
  children?: ReactNode;
}

// ── Colors (DR-5: using existing COLOR_TOKENS values) ────────────────────────

const DOT_COLOR: Record<StatusDotSeverity, string> = {
  info: '#0D0D0D', // --chart-default-1
  warning: '#a16207', // --color-warning
  error: '#b91c1c', // --color-negative
};

// ── StatusDotInner (holds all hooks — see outer StatusDot for suppression) ───

function StatusDotInner({
  severity,
  title,
  message,
  action,
  timestamp,
  className,
  children,
}: Omit<StatusDotProps, 'suppressIfZero'>) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOpen = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    closeTimer.current = setTimeout(() => setOpen(false), 200);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen((s) => !s);
    }
  }, []);

  const color = DOT_COLOR[severity];

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}
      className={className}
      onMouseEnter={handleOpen}
      onMouseLeave={handleClose}
    >
      {/* The pulsating dot — focusable for keyboard / screen-reader access. */}
      <span
        className="status-dot"
        role="img"
        aria-label={`${severity}: ${title}`}
        tabIndex={0}
        onFocus={handleOpen}
        onBlur={handleClose}
        onKeyDown={handleKeyDown}
        style={{ background: color, outline: 'none' }}
      />

      {/* Optional adjacent label (e.g. "Market intelligence") */}
      {children}

      {/* Popover */}
      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            zIndex: 50,
            minWidth: 220,
            maxWidth: 320,
            background: 'var(--color-surface-base)',
            border: '1px solid var(--color-border-hairline)',
            borderRadius: 8,
            padding: 12,
            boxShadow: '0 4px 16px rgba(13,13,13,0.08)',
            pointerEvents: 'auto',
            whiteSpace: 'normal',
          }}
          onMouseEnter={handleOpen}
          onMouseLeave={handleClose}
        >
          {/* Triangle caret */}
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -5,
              left: 6,
              width: 0,
              height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderBottom: '5px solid var(--color-border-hairline)',
            }}
          />
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -4,
              left: 7,
              width: 0,
              height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderBottom: '4px solid var(--color-surface-base)',
            }}
          />
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {title}
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--color-text-secondary)',
              marginTop: 4,
              lineHeight: 1.4,
            }}
          >
            {message}
          </div>
          {action && (
            <div style={{ marginTop: 8 }}>
              {action.href ? (
                <a
                  href={action.href}
                  style={{ fontSize: 12, color: color, textDecoration: 'underline' }}
                >
                  {action.label}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={action.onClick}
                  style={{
                    fontSize: 12,
                    background: 'none',
                    border: '1px solid var(--color-border-hairline)',
                    borderRadius: 6,
                    padding: '3px 10px',
                    cursor: 'pointer',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {action.label}
                </button>
              )}
            </div>
          )}
          {timestamp && (
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 8 }}>
              {timeAgo(timestamp)}
            </div>
          )}
        </span>
      )}
    </span>
  );
}

// ── StatusDot (public export — handles suppression then delegates) ────────────

/**
 * Inline pulsating severity dot with hover-popover.
 *
 * suppressIfZero:  if provided and the value is 0 or non-finite, nothing
 *                  renders — used for KPI YoY tags to suppress zero-deltas.
 */
export function StatusDot(props: StatusDotProps) {
  const { suppressIfZero, ...rest } = props;
  if (suppressIfZero !== undefined && (suppressIfZero === 0 || !Number.isFinite(suppressIfZero))) {
    return null;
  }
  return <StatusDotInner {...rest} />;
}

// ── StatusDotGroup ────────────────────────────────────────────────────────────

/**
 * Groups multiple StatusDots inline.
 * TODO V6.1 v2: collapse > maxVisible dots into "+N more" dot in page header.
 */
export function StatusDotGroup({
  children,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  maxVisible = 3,
}: {
  children: ReactNode;
  maxVisible?: number;
}) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{children}</span>;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diffMs = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return 'noticed just now';
  if (min < 60) return `noticed ${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `noticed ${hr}h ago`;
  return `noticed ${Math.round(hr / 24)}d ago`;
}

export default StatusDot;
