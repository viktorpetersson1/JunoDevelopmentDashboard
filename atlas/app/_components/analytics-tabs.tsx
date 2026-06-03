/**
 * T098.1 — Sub-tab nav for the /analytics umbrella.
 *
 * Rendered at the top of every /analytics/[tab]/page.tsx. Pure presentation
 * (server-renderable) — the page sets its own `activeKey`. Visual treatment is
 * deliberately quiet: a single hairline row with active-tab underline, so the
 * page hero remains the focal point.
 *
 * Route map (V5.2 §T098.1) — note: /risk (singular Monte Carlo) maps to /stress;
 * /risks (qualitative center) maps to /risks.
 */

import Link from 'next/link';
import type { CSSProperties } from 'react';

// T110 (V6.1) fix-pack: `forecast` removed — Annual P&L promoted to Home.
// `forecast` retained as a TypeScript union member because existing pages
// pass `activeKey="forecast"` literals via the type system, but the tab strip
// no longer renders it (and the middleware 301-redirects /analytics/forecast
// → /dashboard regardless).
export type AnalyticsTabKey =
  | 'forecast'
  | 'capital'
  | 'cash-schedule'
  | 'loc'
  | 'self-funding'
  | 'waterfall'
  | 'sensitivity'
  | 'scenarios'
  | 'scenario-modeler'
  | 'stress'
  | 'risks';

interface TabDef {
  key: AnalyticsTabKey;
  label: string;
  href: string;
}

export const ANALYTICS_TABS: readonly TabDef[] = [
  { key: 'capital', label: 'Capital', href: '/analytics/capital' },
  { key: 'cash-schedule', label: 'Cash schedule', href: '/analytics/cash-schedule' },
  { key: 'loc', label: 'LOC repayment', href: '/analytics/loc' },
  { key: 'self-funding', label: 'Self-funding', href: '/analytics/self-funding' },
  { key: 'waterfall', label: 'Waterfall', href: '/analytics/waterfall' },
  { key: 'sensitivity', label: 'Sensitivity', href: '/analytics/sensitivity' },
  { key: 'scenarios', label: 'Scenarios', href: '/analytics/scenarios' },
  { key: 'scenario-modeler', label: 'Modeler', href: '/analytics/scenario-modeler' },
  { key: 'stress', label: 'Stress', href: '/analytics/stress' },
  { key: 'risks', label: 'Risks', href: '/analytics/risks' },
] as const;

const navStyle: CSSProperties = {
  display: 'flex',
  gap: 4,
  flexWrap: 'wrap',
  borderBottom: '1px solid var(--color-border-hairline)',
  marginBottom: 24,
  paddingBottom: 0,
};

function tabStyle(active: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '10px 14px',
    marginBottom: -1, // overlap the border for the active underline
    borderBottom: active ? '2px solid var(--color-text-primary)' : '2px solid transparent',
    color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
    // T103.8 two-weight discipline: 700 active, 400 inactive (was 600/500).
    fontSize: 13,
    fontWeight: active ? 700 : 400,
    textDecoration: 'none',
    transition: 'color 120ms ease, border-color 120ms ease',
  };
}

export function AnalyticsTabs({ activeKey }: { activeKey: AnalyticsTabKey }) {
  return (
    <nav aria-label="Finance & Analytics sections" style={navStyle}>
      {ANALYTICS_TABS.map((t) => (
        <Link key={t.key} href={t.href} style={tabStyle(t.key === activeKey)}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
