/**
 * Card
 * ----
 * Generic white card primitive. The foundational surface container for the
 * Juno Atlas design system.
 *
 * Visual: white background, 1 px hairline border (#EFEFEC), 6 px radius.
 * Interactive variant adds hover treatment: #FAFAF8 background + slightly
 * stronger border — no transform/lift.
 *
 * The `as` prop allows rendering as any element type (div, article, section,
 * a, button) while keeping a consistent visual shell. When `as="a"` or
 * `as="button"` and `interactive` is true, appropriate keyboard focus styles
 * are applied.
 *
 * Tokens: all values reference var(--token-name) from tokens.css.
 *
 * @module layout/Card
 */

import React, { forwardRef, ReactNode, ElementType, ComponentPropsWithRef } from 'react';
import './layout.css';

// ─── Types ───────────────────────────────────────────────────────────────────

// Polymorphic helper: merges Card-specific props with the element's own props.
type AsProp<E extends ElementType> = {
  as?: E;
};

type PropsToOmit<E extends ElementType, P> = keyof (AsProp<E> & P);

type PolymorphicComponentProp<E extends ElementType, P = Record<string, never>> = P &
  AsProp<E> &
  Omit<ComponentPropsWithRef<E>, PropsToOmit<E, P>>;

export interface CardOwnProps {
  /**
   * Inner padding in pixels.
   * @default 24
   */
  padding?: number;
  /**
   * When true, adds hover background and cursor pointer. Use for clickable
   * card surfaces (project cards, leaderboard rows, etc.).
   * @default false
   */
  interactive?: boolean;
  /** Card content */
  children?: ReactNode;
  /** Optional additional CSS class */
  className?: string;
}

export type CardProps<E extends ElementType = 'div'> = PolymorphicComponentProp<E, CardOwnProps>;

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Generic white card container. Renders as a `<div>` by default.
 *
 * @example
 * ```tsx
 * // Basic card
 * <Card>
 *   <KpiValue>$4.2M</KpiValue>
 * </Card>
 *
 * // Interactive (link) card
 * <Card as="a" href="/project/84-sbr" interactive padding={20}>
 *   <ProjectCardContent />
 * </Card>
 *
 * // Custom padding
 * <Card padding={16}>
 *   <CompactContent />
 * </Card>
 * ```
 */
export const Card = forwardRef(function Card<E extends ElementType = 'div'>(
  { as, padding = 24, interactive = false, children, className, style, ...rest }: CardProps<E>,
  ref: React.Ref<Element>,
) {
  const Component = (as ?? 'div') as ElementType;

  const rootClass = [
    'ja-card',
    interactive ? 'ja-card--interactive' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  // Apply padding as a CSS custom property so the CSS rule can reference it.
  const cardStyle: React.CSSProperties = {
    '--ja-card-padding': `${padding}px`,
    ...(style as React.CSSProperties),
  } as React.CSSProperties;

  return (
    <Component
      ref={ref}
      className={rootClass}
      style={cardStyle}
      {...rest}
    >
      {children}
    </Component>
  );
}) as <E extends ElementType = 'div'>(
  props: CardProps<E> & { ref?: React.Ref<Element> },
) => React.ReactElement | null;

// Assign displayName for React DevTools — workaround for forwardRef + generics.
(Card as unknown as { displayName: string }).displayName = 'Card';

export default Card;
