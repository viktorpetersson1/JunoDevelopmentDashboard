/**
 * Section
 * -------
 * Content section with a structured header (title + optional subtitle +
 * optional actions row) and a body slot for arbitrary children.
 *
 * Bordered variant (default): white background, hairline border, 6 px radius,
 * 24 px padding — mirrors the `.card` treatment used for section groupings in
 * the Juno Atlas mockups.
 *
 * Unbounded variant (`bordered={false}`): no background, border, or padding —
 * useful for full-bleed sections inside a PageShell content area.
 *
 * Title: 14px / 500 weight / primary text color.
 * Subtitle: 13px / secondary text color.
 *
 * Accessibility:
 *   - The title renders as an <h2> by default (overridable via `headingLevel`)
 *   - The section element uses an implicit landmark role
 *
 * Tokens: all values reference var(--token-name) from tokens.css.
 *
 * @module layout/Section
 */

import React, { forwardRef, ReactNode, ElementType } from 'react';
import './layout.css';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SectionProps {
  /** Section heading text */
  title: string;
  /** Optional descriptor rendered below the title */
  subtitle?: string;
  /** Optional actions rendered flush-right in the header */
  actions?: ReactNode;
  /** Section body content */
  children?: ReactNode;
  /**
   * When true (default), wraps the section in a white card shell:
   * hairline border + 6 px radius + white background + 24 px padding.
   * When false, renders without any visual wrapper.
   */
  bordered?: boolean;
  /**
   * HTML heading level for the title element.
   * @default 'h2'
   */
  headingLevel?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  /** Optional CSS class appended to the root element */
  className?: string;
  /** Optional id — useful for anchor links and aria-labelledby */
  id?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Structured content section with title, optional subtitle, optional actions,
 * and a bordered card shell.
 *
 * @example
 * ```tsx
 * <Section
 *   title="Cash Flow"
 *   subtitle="12-month rolling projection"
 *   actions={<Button>Export</Button>}
 *   bordered
 * >
 *   <CashFlowChart />
 * </Section>
 * ```
 */
export const Section = forwardRef<HTMLElement, SectionProps>(function Section(
  {
    title,
    subtitle,
    actions,
    children,
    bordered = true,
    headingLevel = 'h2',
    className,
    id,
  },
  ref,
) {
  const hasChildren = children !== undefined && children !== null;

  const rootClass = [
    'ja-section',
    bordered ? 'ja-section--bordered' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const headerClass = [
    'ja-section__header',
    !hasChildren ? 'ja-section__header--no-children' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Dynamic heading element
  const Heading = headingLevel as ElementType;

  return (
    <section
      ref={ref as React.Ref<HTMLElement>}
      className={rootClass}
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
    >
      {/* ── Header ─────────────────────────────── */}
      <div className={headerClass}>
        <div className="ja-section__title-group">
          <Heading
            id={id ? `${id}-title` : undefined}
            className="ja-section__title"
          >
            {title}
          </Heading>

          {subtitle && (
            <p className="ja-section__subtitle">{subtitle}</p>
          )}
        </div>

        {/* Actions slot */}
        {actions && (
          <div className="ja-section__actions">{actions}</div>
        )}
      </div>

      {/* ── Body ───────────────────────────────── */}
      {hasChildren && (
        <div className="ja-section__body">{children}</div>
      )}
    </section>
  );
});

Section.displayName = 'Section';

export default Section;
