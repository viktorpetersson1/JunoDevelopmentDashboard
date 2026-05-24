/**
 * Topbar
 * ------
 * 56 px tall sticky header rendered within the main content column (right of
 * the sidebar). Contains a scenario segmented control on the left, optional
 * page title, optional compact search, and an actions slot on the right.
 *
 * Scenario chips are a 3-pill segmented control (28 px height total). The
 * active pill carries a small lime dot indicator and white background.
 *
 * Accessibility:
 *   - role="banner" on the root element
 *   - aria-label on each scenario button
 *   - aria-pressed on the active scenario button
 *
 * Tokens: all values reference var(--token-name) from tokens.css.
 *
 * @module layout/Topbar
 */

import React, { forwardRef, type ReactNode } from 'react';
import './layout.css';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ScenarioVariant = 'base' | 'optimistic' | 'pessimistic';

export interface TopbarSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export interface TopbarProps {
  /** Optional page title displayed to the left of the scenario switcher */
  title?: string;
  /** Currently active scenario */
  scenario: ScenarioVariant;
  /** Called when the user selects a different scenario */
  onScenarioChange: (scenario: ScenarioVariant) => void;
  /** Optional slot for action buttons on the right */
  actions?: ReactNode;
  /** When provided, renders a compact search input before the actions */
  search?: TopbarSearchProps;
  /** Optional CSS class appended to the root element */
  className?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SCENARIOS: { value: ScenarioVariant; label: string }[] = [
  { value: 'pessimistic', label: 'Pessimistic' },
  { value: 'base', label: 'Base' },
  { value: 'optimistic', label: 'Optimistic' },
];

// ─── Search icon ─────────────────────────────────────────────────────────────

const SearchIcon = () => (
  <svg
    className="ja-topbar__search-icon"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    aria-hidden="true"
  >
    <circle cx="6.5" cy="6.5" r="4" />
    <path d="M10 10l3 3" strokeLinecap="round" />
  </svg>
);

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Application topbar with scenario switcher, search, and action slot.
 *
 * @example
 * ```tsx
 * <Topbar
 *   scenario="base"
 *   onScenarioChange={(s) => setScenario(s)}
 *   actions={<Button variant="primary">New project</Button>}
 *   search={{ value: query, onChange: setQuery }}
 * />
 * ```
 */
export const Topbar = forwardRef<HTMLElement, TopbarProps>(function Topbar(
  { title, scenario, onScenarioChange, actions, search, className },
  ref
) {
  const rootClass = ['ja-topbar', className].filter(Boolean).join(' ');

  return (
    <header ref={ref} className={rootClass} role="banner" aria-label="Page topbar">
      {/* ── Left cluster ──────────────────────────────── */}
      <div className="ja-topbar__left">
        {/* Page title (usually omitted) */}
        {title && (
          <span className="ja-topbar__title" aria-label="Page title">
            {title}
          </span>
        )}

        {/* Scenario segmented control */}
        <div className="ja-topbar__scenario" role="group" aria-label="Scenario selector">
          {SCENARIOS.map(({ value, label }) => {
            const isActive = value === scenario;
            const pillClass = [
              'ja-topbar__scenario-pill',
              isActive ? 'ja-topbar__scenario-pill--active' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                key={value}
                type="button"
                className={pillClass}
                aria-pressed={isActive}
                aria-label={`${label} scenario`}
                onClick={() => onScenarioChange(value)}
              >
                {/* Active dot indicator */}
                {isActive && <span className="ja-topbar__scenario-dot" aria-hidden="true" />}
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right cluster ─────────────────────────────── */}
      <div className="ja-topbar__right">
        {/* Compact search */}
        {search && (
          <div className="ja-topbar__search" role="search">
            <SearchIcon />
            <input
              type="search"
              className="ja-topbar__search-input"
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder ?? 'Search…'}
              aria-label="Site search"
            />
          </div>
        )}

        {/* Action slot */}
        {actions && (
          <div className="ja-topbar__actions" aria-label="Page actions">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
});

Topbar.displayName = 'Topbar';

export default Topbar;
