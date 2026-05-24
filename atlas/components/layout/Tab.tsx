/**
 * Tab
 * ---
 * Single tab anchor rendered inside a TabStrip. Can be used as an <a> or
 * <button> element depending on the `href` prop.
 *
 * Active state: dark text (#0D0D0D) + 2 px bottom border in the same color.
 * Inactive state: secondary text (#6B7280), no underline.
 * Font: 14px / 500 weight (active: 600) / 12px vertical padding.
 *
 * An optional `count` badge is rendered as a small pill to the right of
 * the label — useful for showing record counts (e.g. "Risks  4").
 *
 * Accessibility:
 *   - Uses `aria-current="page"` when active (via the `active` prop)
 *   - When no `href` is supplied, renders as a <button> with role="tab"
 *
 * Tokens: all values reference var(--token-name) from tokens.css.
 *
 * @module layout/Tab
 */

import React, { forwardRef, type ReactNode } from 'react';
import './layout.css';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TabProps {
  /** Destination URL. When omitted the tab renders as a <button>. */
  href?: string;
  /** Whether this tab represents the currently active view */
  active?: boolean;
  /** Tab label text */
  children: ReactNode;
  /** Optional numeric or string count shown as a small badge */
  count?: number | string;
  /** Optional CSS class appended to the root element */
  className?: string;
  /** Click handler — useful for SPA navigation or when used as a button */
  onClick?: React.MouseEventHandler<HTMLAnchorElement | HTMLButtonElement>;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * A single navigational tab for use inside a TabStrip.
 *
 * @example
 * ```tsx
 * <Tab href="/project/summary" active>
 *   Summary
 * </Tab>
 *
 * <Tab href="/project/risks" count={4}>
 *   Risks
 * </Tab>
 * ```
 */
export const Tab = forwardRef<HTMLAnchorElement & HTMLButtonElement, TabProps>(function Tab(
  { href, active = false, children, count, className, onClick },
  ref
) {
  const rootClass = ['ja-tab', active ? 'ja-tab--active' : '', className].filter(Boolean).join(' ');

  const content = (
    <>
      {children}
      {count !== undefined && (
        <span className="ja-tab__count" aria-label={`${count} items`}>
          {count}
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <a
        ref={ref as React.Ref<HTMLAnchorElement>}
        href={href}
        className={rootClass}
        aria-current={active ? 'page' : undefined}
        onClick={onClick as React.MouseEventHandler<HTMLAnchorElement>}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      type="button"
      role="tab"
      className={rootClass}
      aria-selected={active}
      aria-current={active ? 'page' : undefined}
      onClick={onClick as React.MouseEventHandler<HTMLButtonElement>}
    >
      {content}
    </button>
  );
});

Tab.displayName = 'Tab';

export default Tab;
