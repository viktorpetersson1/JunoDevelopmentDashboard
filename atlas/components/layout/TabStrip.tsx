/**
 * TabStrip
 * --------
 * Horizontal tab row container. Renders a flex row with a bottom hairline
 * border that the active Tab indicator sits on top of (via the -1px
 * margin-bottom trick on each Tab).
 *
 * This component serves both patterns in the Juno Atlas design:
 *   1. Project-detail tabs  (Summary / Inputs / Forecast / Capital / Risks …)
 *   2. Sub-nav strip        (Cash flow / Scenarios / Sensitivity / Stress test)
 *
 * Margin: 4px top, 16px bottom — matches the mockup spec and the CSS variable
 * assignment on `.ja-tab-strip`.
 *
 * Usage: wrap <Tab> children directly. The strip provides the shared baseline.
 *
 * Accessibility:
 *   - role="tablist" when used as a tab panel controller
 *   - aria-label should be supplied by the consumer via `aria-label` prop
 *
 * Tokens: all values reference var(--token-name) from tokens.css.
 *
 * @module layout/TabStrip
 */

import React, { forwardRef, type ReactNode } from 'react';
import './layout.css';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TabStripProps {
  /** Tab nodes (<Tab /> elements) */
  children: ReactNode;
  /** Accessible label for the tab group — passed to aria-label */
  'aria-label'?: string;
  /** Optional CSS class appended to the root element */
  className?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Horizontal tab row container for use with <Tab> children.
 *
 * Renders with `role="tablist"` by default. Pass `aria-label` to identify
 * the tab group for assistive technologies.
 *
 * @example
 * ```tsx
 * <TabStrip aria-label="Project sections">
 *   <Tab href="/summary" active>Summary</Tab>
 *   <Tab href="/forecast">Forecast</Tab>
 *   <Tab href="/risks" count={4}>Risks</Tab>
 * </TabStrip>
 * ```
 */
export const TabStrip = forwardRef<HTMLDivElement, TabStripProps>(function TabStrip(
  { children, className, 'aria-label': ariaLabel },
  ref
) {
  const rootClass = ['ja-tab-strip', className].filter(Boolean).join(' ');

  return (
    <div ref={ref} className={rootClass} role="tablist" aria-label={ariaLabel}>
      {children}
    </div>
  );
});

TabStrip.displayName = 'TabStrip';

export default TabStrip;
