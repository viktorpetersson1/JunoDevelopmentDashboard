/**
 * Juno Atlas — Layout Components
 * --------------------------------
 * Barrel export for all layout-layer components and their prop types.
 *
 * Usage:
 *   import { Sidebar, Topbar, PageShell, Tab, TabStrip, Section, Card } from './layout';
 *
 * All components also have default exports for single-component imports:
 *   import Sidebar from './layout/Sidebar';
 *
 * @module layout
 */

// ── Components ───────────────────────────────────────────────────────────────

export { Sidebar, default as SidebarDefault } from './Sidebar';
export { Topbar, default as TopbarDefault } from './Topbar';
export { PageShell, default as PageShellDefault } from './PageShell';
export { Tab, default as TabDefault } from './Tab';
export { TabStrip, default as TabStripDefault } from './TabStrip';
export { Section, default as SectionDefault } from './Section';
export { Card } from './Card';

// ── Prop Types ───────────────────────────────────────────────────────────────

export type { SidebarProps, SidebarSection, SidebarNavItem, SidebarUser } from './Sidebar';

export type { TopbarProps, TopbarSearchProps, ScenarioVariant } from './Topbar';

export type { PageShellProps } from './PageShell';

export type { TabProps } from './Tab';

export type { TabStripProps } from './TabStrip';

export type { SectionProps } from './Section';

export type { CardProps, CardOwnProps } from './Card';

// ── CSS (side-effect import for bundlers that tree-shake CSS) ────────────────
// Consumers that use a CSS loader can import './layout/layout.css' directly.
// This barrel does not import CSS to avoid duplicating styles when components
// are individually imported.
