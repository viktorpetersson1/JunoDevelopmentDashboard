'use client';

/**
 * AppShell
 * --------
 * Top-level page wrapper that composes Sidebar + Topbar + content slot via
 * PageShell. Bakes in the full Juno navigation structure as default sections,
 * while allowing full override via `sidebarSections`. Also bakes in a default
 * user object, overridable via `user`.
 *
 * Used on: every authenticated page in the application.
 *
 * 'use client' because the default sidebar sections include the Ask Juno
 * CTA (V4.1b) whose onClick handler dispatches a custom DOM event —
 * window.dispatchEvent only exists at runtime in the browser.
 *
 * @example
 * ```tsx
 * // Minimal — uses all defaults
 * <AppShell activeHref="/projects" scenario={scenario} onScenarioChange={setScenario}>
 *   <ProjectsListPage />
 * </AppShell>
 *
 * // With overrides
 * <AppShell
 *   activeHref="/settings"
 *   scenario="base"
 *   onScenarioChange={setScenario}
 *   topbarActions={<Button variant="primary">Save changes</Button>}
 *   user={{ name: 'Alex Chen', email: 'alex@juno.com' }}
 * >
 *   <SettingsPage />
 * </AppShell>
 * ```
 *
 * @module patterns/AppShell
 */

import React, { ReactNode } from 'react';
import {
  Sidebar,
  SidebarSection,
  SidebarUser,
  Topbar,
  PageShell,
  TopbarSearchProps,
} from '../components/layout';
import type { ScenarioVariant } from '../components/layout';
import { JunoMark } from '../components/brand';
import './patterns.css';

// ─── Default nav icons ────────────────────────────────────────────────────────
// Inline SVG icons for the default sidebar nav items. Using 20×20 viewBox with
// 1.5px stroke-width for consistent weight across all nav icons.

const OverviewIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <rect x="2.5" y="2.5" width="6" height="6" rx="1" />
    <rect x="11.5" y="2.5" width="6" height="6" rx="1" />
    <rect x="2.5" y="11.5" width="6" height="6" rx="1" />
    <rect x="11.5" y="11.5" width="6" height="6" rx="1" />
  </svg>
);

const ProjectsIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M2.5 7.5L10 3l7.5 4.5v9H2.5V7.5z" />
    <path d="M7.5 17V11h5v6" />
  </svg>
);

/** Analytics icon — chart line with tabs, evoking the multi-view umbrella. */
const AnalyticsIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M2.5 17.5h15" strokeLinecap="round" />
    <path d="M5 13l3-4 3 3 4-6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2.5 4.5h5M9.5 4.5h5" strokeLinecap="round" />
  </svg>
);

/** Earnings icon — bar chart with upward arrow, evoking shareholder profit. */
const EarningsIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <rect x="3" y="10" width="3" height="7.5" rx="0.5" />
    <rect x="8.5" y="6.5" width="3" height="11" rx="0.5" />
    <rect x="14" y="3.5" width="3" height="14" rx="0.5" />
  </svg>
);

/** Pipeline kanban icon — 3 stacked-card columns. */
const PipelineIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <rect x="2.5" y="3.5" width="4" height="13" rx="1" />
    <rect x="8" y="3.5" width="4" height="9" rx="1" />
    <rect x="13.5" y="3.5" width="4" height="6" rx="1" />
  </svg>
);

/** Pricing icon — tag with $ glyph. */
const PricingIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M11 2.5h6.5v6.5L9 17.5l-6.5-6.5L11 2.5z" strokeLinejoin="round" />
    <circle cx="14" cy="6" r="1.25" />
  </svg>
);

const NotificationsIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M10 2.5a5 5 0 0 0-5 5v3l-1.5 2h13L15 10.5v-3a5 5 0 0 0-5-5z" strokeLinejoin="round" />
    <path d="M8.5 15.5a1.5 1.5 0 0 0 3 0" strokeLinecap="round" />
  </svg>
);

const SettingsIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <circle cx="10" cy="10" r="2.5" />
    <path
      d="M10 2.5v1.2M10 16.3v1.2M2.5 10h1.2M16.3 10h1.2M4.7 4.7l.85.85M14.45 14.45l.85.85M4.7 15.3l.85-.85M14.45 5.55l.85-.85"
      strokeLinecap="round"
    />
  </svg>
);

/** Ask Juno icon — twin sparkles, evoking the agentic assistant. */
const AskJunoIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M9 3l1.4 3.6L14 8l-3.6 1.4L9 13 7.6 9.4 4 8l3.6-1.4L9 3z" strokeLinejoin="round" />
    <path d="M15 12.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" strokeLinejoin="round" />
  </svg>
);

// ─── Juno Logo ────────────────────────────────────────────────────────────────

const JunoLogo = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <JunoMark size={22} ariaLabel="Juno" />
    <span
      style={{
        fontSize: 15,
        fontWeight: 600,
        letterSpacing: '-0.03em',
        color: 'var(--color-text-primary)',
      }}
    >
      Juno Atlas
    </span>
  </div>
);

// ─── Default nav structure (T098 — V5.2) ────────────────────────────────────
//
// 6 primary items + 2 account items, no section labels.
// The Analytics umbrella replaces the 7 individual portfolio routes.
// Suggestions + Ask Juno removed from primary nav (Suggestions lives inside
// Settings; Ask Juno remains as the floating widget + bottom-right launcher).

export const DEFAULT_SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    // No label — the 6 primary items need no header. Two sections separated
    // by CSS margin-top (ja-sidebar__section + ja-sidebar__section) gives
    // the single divider before Notifications/Settings.
    items: [
      { href: '/dashboard', label: 'Home', icon: <OverviewIcon /> },
      { href: '/agent', label: 'Ask Juno', icon: <AskJunoIcon /> },
      { href: '/projects', label: 'Projects', icon: <ProjectsIcon /> },
      { href: '/pipeline', label: 'Pipeline', icon: <PipelineIcon /> },
      { href: '/pricing', label: 'Pricing', icon: <PricingIcon /> },
      { href: '/analytics', label: 'Finance & Analytics', icon: <AnalyticsIcon /> },
      { href: '/earnings', label: 'Earnings', icon: <EarningsIcon /> },
    ],
  },
  {
    items: [
      { href: '/notifications', label: 'Notifications', icon: <NotificationsIcon /> },
      { href: '/settings', label: 'Settings', icon: <SettingsIcon /> },
    ],
  },
];

export const DEFAULT_USER: SidebarUser = {
  name: 'Viktor Petersson',
  email: 'viktor@juno.com',
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AppShellProps {
  /** Href of the currently active nav item */
  activeHref: string;
  /** Currently active scenario — passed to Topbar */
  scenario: ScenarioVariant;
  /** Called when the user changes scenario */
  onScenarioChange: (scenario: ScenarioVariant) => void;
  /** Optional Topbar right-side action slot */
  topbarActions?: ReactNode;
  /** Optional Topbar search props */
  search?: TopbarSearchProps;
  /** Override the full sidebar nav structure */
  sidebarSections?: SidebarSection[];
  /** Override the authenticated user identity */
  user?: SidebarUser;
  /** Page content rendered in the scrollable main area */
  children: ReactNode;
  /** Optional CSS class appended to the root element */
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * AppShell — top-level page wrapper for every authenticated Juno page.
 *
 * Composes Sidebar + Topbar + PageShell with the canonical Juno navigation
 * structure. Designed to be the outermost wrapper on each page; children
 * receive the scrollable content area.
 */
export function AppShell({
  activeHref,
  scenario,
  onScenarioChange,
  topbarActions,
  search,
  sidebarSections = DEFAULT_SIDEBAR_SECTIONS,
  user = DEFAULT_USER,
  children,
  className,
}: AppShellProps) {
  const rootClass = ['ja-app-shell', className].filter(Boolean).join(' ');

  const sidebar = (
    <Sidebar sections={sidebarSections} user={user} activeHref={activeHref} logo={<JunoLogo />} />
  );

  const topbar = (
    <Topbar
      scenario={scenario}
      onScenarioChange={onScenarioChange}
      actions={topbarActions}
      search={search}
    />
  );

  return (
    <div className={rootClass}>
      <PageShell sidebar={sidebar} topbar={topbar}>
        {children}
      </PageShell>
    </div>
  );
}

export default AppShell;
