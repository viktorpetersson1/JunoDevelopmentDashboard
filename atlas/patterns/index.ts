/**
 * Juno Atlas — Patterns Layer
 * ============================
 * Barrel export for all composed page patterns.
 *
 * These higher-order compositions wire together primitives, layout, data,
 * and feedback components into reusable page-level starting templates.
 * Consumers (and Claude Code) import from this single entry point.
 *
 * Usage:
 *   import { AppShell, ListPage, FormPage, TabbedPage, KpiPattern, TwoColPattern }
 *     from '@juno-atlas/patterns';
 *
 * CSS side-effect:
 *   Patterns share a single stylesheet — patterns.css. Import it once at your
 *   app root or bundle entry, or rely on your bundler's CSS tree-shaking via
 *   the individual component imports (each TSX file imports patterns.css).
 *
 * @module patterns
 */

// ── AppShell ─────────────────────────────────────────────────────────────────
// Top-level page wrapper composing Sidebar + Topbar + PageShell.
// Bakes in the full Juno nav structure with override support.

export { AppShell, default as AppShellDefault } from './AppShell';
export type { AppShellProps } from './AppShell';
export { DEFAULT_SIDEBAR_SECTIONS, DEFAULT_USER } from './AppShell';

// ── ListPage ─────────────────────────────────────────────────────────────────
// List / table page pattern: header + filter toolbar + Table + EmptyState.
// Used for Projects, Risks, Users, Suggestions.

export { ListPage, default as ListPageDefault } from './ListPage';
export type { ListPageProps, ListPagePrimaryAction, ListPageEmptyConfig } from './ListPage';

// ── FormPage ─────────────────────────────────────────────────────────────────
// Form / settings page pattern: header + two-column layout (form | rail) + footer.
// Used for Settings General, New Project Wizard, project edit screens.

export { FormPage, default as FormPageDefault } from './FormPage';
export type { FormPageProps, FormSection } from './FormPage';

// ── TabbedPage ───────────────────────────────────────────────────────────────
// Page with sub-nav TabStrip: header + TabStrip + active tab content slot.
// Used for Project detail, Settings sub-nav, Forecast sub-sections.

export { TabbedPage, default as TabbedPageDefault } from './TabbedPage';
export type { TabbedPageProps, TabbedPageTab } from './TabbedPage';

// ── KpiPattern ───────────────────────────────────────────────────────────────
// KPI strip + chart card + summary rail — the dominant portfolio dashboard motif.
// Used for Portfolio Overview, Project Summary, Forecast pages.

export { KpiPattern, default as KpiPatternDefault } from './KpiPattern';
export type { KpiPatternProps } from './KpiPattern';

// ── TwoColPattern ─────────────────────────────────────────────────────────────
// Generic 1.55fr main + 1fr rail layout. Pure layout, no visual opinions.
// Used across almost every page body in the app.

export { TwoColPattern, default as TwoColPatternDefault } from './TwoColPattern';
export type { TwoColPatternProps } from './TwoColPattern';
