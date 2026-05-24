/**
 * TabbedPage
 * ----------
 * Page pattern with a page header and a sub-nav TabStrip. Covers two dominant
 * patterns in the Juno Atlas app:
 *
 *   1. Project detail tabs — Summary / Inputs / Forecast / Capital / Risks /
 *      Timeline / Activity (tight `4px top 16px bottom` tab strip margin)
 *   2. Settings sub-nav strip — General / History / Suggestions / Users
 *
 * The active tab's content is rendered below the strip as `children`. The
 * consumer owns routing; this component is display-only (no internal tab
 * state).
 *
 * Used for: Project detail pages, Settings (General/History/Users), Forecast
 * sub-sections (Cash Flow / Scenarios / Sensitivity / Stress Test).
 *
 * @example
 * ```tsx
 * // Project detail
 * <AppShell activeHref="/projects" scenario={scenario} onScenarioChange={setScenario}
 *   topbarActions={<Button>Edit inputs</Button>}>
 *   <TabbedPage
 *     title="84 SBR"
 *     subtitle="84 Sunset Beach Rd, Sag Harbor, NY"
 *     actions={<><Button variant="secondary">Export</Button><Button variant="primary">Edit inputs</Button></>}
 *     tabs={[
 *       { href: '/projects/84sbr/summary',  label: 'Summary',  active: true  },
 *       { href: '/projects/84sbr/forecast', label: 'Forecast', active: false },
 *       { href: '/projects/84sbr/risks',    label: 'Risks', count: 4, active: false },
 *     ]}
 *   >
 *     <SummaryTabContent />
 *   </TabbedPage>
 * </AppShell>
 *
 * // Settings sub-nav
 * <TabbedPage
 *   title="Settings"
 *   subtitle="Financial assumptions, risk thresholds, markets, and cap table."
 *   tabs={[
 *     { href: '/settings',          label: 'General',     active: true  },
 *     { href: '/settings/history',  label: 'History',     active: false },
 *     { href: '/settings/users',    label: 'Users',       active: false },
 *   ]}
 * >
 *   <GeneralSettingsContent />
 * </TabbedPage>
 * ```
 *
 * @module patterns/TabbedPage
 */

import React, { type ReactNode } from 'react';
import { TabStrip, Tab } from '../components/layout';
import './patterns.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TabbedPageTab {
  /** Destination href — passed to <Tab> */
  href: string;
  /** Tab label */
  label: string;
  /** Optional count badge */
  count?: number | string;
  /** Whether this tab is currently active */
  active: boolean;
  /** Optional click handler for SPA navigation */
  onClick?: React.MouseEventHandler<HTMLAnchorElement | HTMLButtonElement>;
}

export interface TabbedPageProps {
  /** Page heading */
  title: string;
  /** Optional subtitle / meta line below the heading */
  subtitle?: string;
  /** Optional actions slot rendered flush-right in the page header */
  actions?: ReactNode;
  /** Tab definitions — renders each as a <Tab> inside a <TabStrip> */
  tabs: TabbedPageTab[];
  /** Content for the currently active tab */
  children?: ReactNode;
  /** Accessible label for the tab group (default: "Page sections") */
  tabGroupLabel?: string;
  /** Optional CSS class appended to the root element */
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Page pattern with header + TabStrip + active tab content slot.
 *
 * The component is stateless — consumers control which tab is active via
 * the `tabs[n].active` flag and handle navigation via `onClick` or `href`.
 */
export function TabbedPage({
  title,
  subtitle,
  actions,
  tabs,
  children,
  tabGroupLabel = 'Page sections',
  className,
}: TabbedPageProps) {
  const rootClass = ['ja-tabbed-page', className].filter(Boolean).join(' ');

  return (
    <div className={rootClass} aria-labelledby="ja-tabbed-page-title">
      {/* ── Page header ─────────────────────────────── */}
      <div className="ja-tabbed-page__header">
        <div className="ja-tabbed-page__title-group">
          <h1 id="ja-tabbed-page-title" className="ja-tabbed-page__title">
            {title}
          </h1>
          {subtitle && <p className="ja-tabbed-page__subtitle">{subtitle}</p>}
        </div>

        {actions && <div className="ja-tabbed-page__actions">{actions}</div>}
      </div>

      {/* ── Tab strip ───────────────────────────────── */}
      {/* Margin override: 4px top, 16px bottom (per spec) */}
      <TabStrip aria-label={tabGroupLabel}>
        {tabs.map((tab) => (
          <Tab
            key={tab.href}
            href={tab.href}
            active={tab.active}
            count={tab.count}
            onClick={tab.onClick}
          >
            {tab.label}
          </Tab>
        ))}
      </TabStrip>

      {/* ── Active tab content ──────────────────────── */}
      <div className="ja-tabbed-page__content">{children}</div>
    </div>
  );
}

export default TabbedPage;
