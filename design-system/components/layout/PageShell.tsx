/**
 * PageShell
 * ---------
 * Composes Sidebar + Topbar + main content into the canonical app shell grid.
 *
 * Layout grid:
 *   Columns: [232px sidebar] [1fr main]
 *   Rows:    [56px topbar]   [1fr scrollable content]
 *
 * The sidebar spans both rows on the left (fixed via CSS, represented in the
 * grid layout by the sidebar column). The topbar sticks to the top of the
 * right column. The content area scrolls independently.
 *
 * Content inner width is capped at 1360px with padding 32px 48px 80px.
 * Background of the content area: var(--color-surface-sunken) = #FAFAF8.
 *
 * Accessibility:
 *   - Sidebar wrapper: aria-label on the aside (handled inside Sidebar component)
 *   - Topbar wrapper: role="banner" (handled inside Topbar component)
 *   - Content: role="main", aria-label="Page content"
 *
 * Tokens: all values reference var(--token-name) from tokens.css.
 *
 * @module layout/PageShell
 */

import React, { forwardRef, ReactNode } from 'react';
import './layout.css';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PageShellProps {
  /** Sidebar component (typically <Sidebar />) */
  sidebar: ReactNode;
  /** Topbar component (typically <Topbar />) */
  topbar: ReactNode;
  /** Page content — rendered inside the scrollable main area */
  children: ReactNode;
  /** Optional CSS class appended to the root element */
  className?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Root application shell that composes Sidebar, Topbar, and the main
 * scrollable content area into a two-column, two-row grid.
 *
 * @example
 * ```tsx
 * <PageShell
 *   sidebar={<Sidebar sections={nav} user={user} activeHref="/" logo={<Logo />} />}
 *   topbar={<Topbar scenario="base" onScenarioChange={setScenario} actions={<Actions />} />}
 * >
 *   <PageHeader title="Portfolio" />
 *   <KpiRow />
 *   <TwoColGrid />
 * </PageShell>
 * ```
 */
export const PageShell = forwardRef<HTMLDivElement, PageShellProps>(
  function PageShell({ sidebar, topbar, children, className }, ref) {
    const rootClass = ['ja-page-shell', className].filter(Boolean).join(' ');

    return (
      <div ref={ref} className={rootClass}>
        {/* ── Sidebar column (spans full height via fixed CSS) ─── */}
        <div className="ja-page-shell__sidebar" aria-hidden="false">
          {sidebar}
        </div>

        {/* ── Topbar (top of right column, sticky) ─────────────── */}
        <div className="ja-page-shell__topbar">{topbar}</div>

        {/* ── Main scrollable content ──────────────────────────── */}
        <main
          className="ja-page-shell__content"
          role="main"
          aria-label="Page content"
          id="main-content"
        >
          {/* Inner wrapper applies max-width + padding */}
          <div className="ja-page-shell__content-inner">{children}</div>
        </main>
      </div>
    );
  },
);

PageShell.displayName = 'PageShell';

export default PageShell;
