/**
 * TwoColPattern
 * -------------
 * Generic two-column layout shell. 1.55fr main column + 1fr rail column.
 * The dominant body layout across the Juno Atlas app — used wherever a
 * primary content area needs a supporting sidebar/panel.
 *
 * This is a pure layout primitive with zero visual opinions:
 *   - No background, border, or padding of its own
 *   - No heading, title, or chrome
 *   - Children fully own their visual treatment
 *
 * Gap and stacking breakpoint are configurable via props (CSS custom
 * properties drive the grid so overrides are cheap).
 *
 * Used for:
 *   - Portfolio Overview: active-projects list | prospective-projects rail
 *   - Project Summary: main narrative | action rail
 *   - Capital page: waterfall chart | debt schedule rail
 *   - Settings: form sections | live-impact rail (via FormPage)
 *   - Any page body that needs 60/40 two-column split
 *
 * @example
 * ```tsx
 * // Basic usage
 * <TwoColPattern
 *   main={<ActiveProjectsSection />}
 *   rail={<ProspectiveSection />}
 * />
 *
 * // Tighter gap
 * <TwoColPattern
 *   main={<CashFlowChart />}
 *   rail={<DebtScheduleTable />}
 *   gap={16}
 * />
 *
 * // Stack below 768px instead of the default 1024px
 * <TwoColPattern
 *   main={<Content />}
 *   rail={<Aside />}
 *   stackBelow={768}
 * />
 * ```
 *
 * @module patterns/TwoColPattern
 */

import React, { type ReactNode, type CSSProperties } from 'react';
import './patterns.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TwoColPatternProps {
  /** Primary (wider) content — 1.55fr */
  main: ReactNode;
  /** Secondary / supporting content — 1fr */
  rail: ReactNode;
  /**
   * Column gap in pixels (or any valid CSS length string).
   * Defaults to 24 (var(--space-6)).
   */
  gap?: number | string;
  /**
   * Viewport width (px) below which columns stack vertically.
   * Defaults to 1024. Set to 0 to never stack.
   * Applied as an inline container-style media-query via a CSS custom
   * property so consumers can override via CSS if needed.
   */
  stackBelow?: number;
  /** Additional class names appended to the root element */
  className?: string;
  /** Optional aria-label for the layout wrapper */
  'aria-label'?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Generic 1.55fr / 1fr two-column layout.
 *
 * Pure layout — no visual opinions about what goes inside.
 * Pass any ReactNode to `main` and `rail`.
 */
export function TwoColPattern({
  main,
  rail,
  gap = 24,
  stackBelow = 1024,
  className,
  'aria-label': ariaLabel,
}: TwoColPatternProps) {
  const rootClass = ['ja-two-col', className].filter(Boolean).join(' ');

  // Resolve gap to CSS length
  const gapValue = typeof gap === 'number' ? `${gap}px` : gap;

  // The CSS breakpoint is driven by a CSS custom property so that the
  // patterns.css @media rule can be overridden if needed. We also apply a
  // data attribute so that consumers can target specific breakpoint values.
  const inlineStyle: CSSProperties = {
    '--ja-twocol-gap': gapValue,
  } as CSSProperties;

  return (
    <div
      className={rootClass}
      style={inlineStyle}
      data-stack-below={stackBelow}
      aria-label={ariaLabel}
    >
      {/* Main column — 1.55fr */}
      <div className="ja-two-col__main">{main}</div>

      {/* Rail column — 1fr */}
      <aside className="ja-two-col__rail">{rail}</aside>
    </div>
  );
}

export default TwoColPattern;
