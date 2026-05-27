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

const ForecastIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M2.5 17.5h15" strokeLinecap="round" />
    <path d="M5 13.5l3.5-4 3 3 4-5.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CapitalIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <circle cx="10" cy="10" r="7.5" />
    <path d="M10 6.5v7M7.5 8.5c0-1.1.9-2 2.5-2s2.5.9 2.5 2-1.1 2-2.5 2-2.5.9-2.5 2 .9 2 2.5 2 2.5-.9 2.5-2" />
  </svg>
);

const RisksIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M10 2.5L2.5 17.5h15L10 2.5z" strokeLinejoin="round" />
    <path d="M10 8.5v4" strokeLinecap="round" />
    <circle cx="10" cy="14.5" r="0.75" fill="currentColor" stroke="none" />
  </svg>
);

const SuggestionsIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <circle cx="10" cy="9" r="5.5" />
    <path d="M10 4.5v4.5l2.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 16.5h4" strokeLinecap="round" />
    <path d="M9 18.5h2" strokeLinecap="round" />
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

/**
 * V4.1b — Ask Juno icon restored. The widget is still global (right-docked
 * panel + bottom-right floating launcher mounted via app/providers.tsx),
 * but the sidebar now also offers a CTA that DISPATCHES an open event
 * instead of navigating. Two entry points, one widget.
 */
const AskJunoIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <circle cx="10" cy="10" r="7.75" />
    <line x1="10" y1="2.25" x2="10" y2="17.75" strokeLinecap="round" />
  </svg>
);

/** Custom DOM event the sidebar fires; the AskJunoWidget listens for it. */
export const ASK_JUNO_OPEN_EVENT = 'atlas:open-ask-juno';
function openAskJuno() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ASK_JUNO_OPEN_EVENT));
  }
}

const NotificationsIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path
      d="M10 2.5a5 5 0 0 0-5 5v3l-1.5 2h13L15 10.5v-3a5 5 0 0 0-5-5z"
      strokeLinejoin="round"
    />
    <path d="M8.5 15.5a1.5 1.5 0 0 0 3 0" strokeLinecap="round" />
  </svg>
);

const UsersIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <circle cx="8" cy="7" r="3" />
    <path d="M2 17c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round" />
    <path d="M14 5c1.1 0 2 .9 2 2s-.9 2-2 2" strokeLinecap="round" />
    <path d="M16 13c1.7.6 3 2.2 3 4" strokeLinecap="round" />
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

// ─── Default nav structure ────────────────────────────────────────────────────

export const DEFAULT_SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    label: 'PORTFOLIO',
    items: [
      // T081.3 — Overview moved from `/` to `/dashboard` (canonical surface).
      { href: '/dashboard', label: 'Overview', icon: <OverviewIcon /> },
      { href: '/cashflow', label: 'Forecast', icon: <ForecastIcon /> },
      { href: '/capital', label: 'Capital', icon: <CapitalIcon /> },
      { href: '/risks', label: 'Risks', icon: <RisksIcon /> },
    ],
  },
  {
    label: 'WORKSPACE',
    items: [
      { href: '/projects', label: 'Projects', icon: <ProjectsIcon /> },
      { href: '/pipeline', label: 'Pipeline', icon: <PipelineIcon /> },
      { href: '/pricing', label: 'Pricing', icon: <PricingIcon /> },
      { href: '/suggestions', label: 'Suggestions', icon: <SuggestionsIcon /> },
      // V4.1b — Ask Juno CTA. Does NOT navigate — fires the open event so
      // the global AskJunoWidget (app/providers.tsx) pops the right-docked
      // panel. href '#ask-juno' is a stable anchor (never matches an
      // activeHref) so the keyboard/screen-reader path stays sane.
      {
        href: '#ask-juno',
        label: 'Ask Juno',
        icon: <AskJunoIcon />,
        onClick: openAskJuno,
      },
    ],
  },
  {
    label: 'ACCOUNT',
    items: [
      { href: '/notifications', label: 'Notifications', icon: <NotificationsIcon /> },
      // "Owners" lives inside /settings as a tab — no separate top-level entry.
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
