/**
 * Button — Juno Atlas primitive
 *
 * The primary interactive trigger. Four variants cover all use-cases:
 *   - `primary`  : lime CTA fill — use once per view
 *   - `secondary`: white with hairline border — default action
 *   - `ghost`    : text-only, no border
 *   - `danger`   : destructive action
 *
 * @example
 * <Button variant="primary" size="md" onClick={handleSave}>Save Project</Button>
 * <Button variant="secondary" iconLeft={<PlusIcon />} loading={saving}>Add Row</Button>
 */

import React, { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react';
import './primitives.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style of the button */
  variant?: ButtonVariant;
  /** Height: sm=28px, md=32px (default), lg=36px */
  size?: ButtonSize;
  /** Disabled state — prevents all interaction */
  disabled?: boolean;
  /** Loading state — shows spinner, prevents interaction */
  loading?: boolean;
  /** Icon rendered to the left of the label */
  iconLeft?: ReactNode;
  /** Icon rendered to the right of the label */
  iconRight?: ReactNode;
  /** Expand to fill container width */
  fullWidth?: boolean;
  children?: ReactNode;
}

const Spinner = () => (
  <span className="ja-button__spinner" aria-hidden="true" />
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      disabled = false,
      loading = false,
      iconLeft,
      iconRight,
      fullWidth = false,
      children,
      className = '',
      onClick,
      type = 'button',
      ...rest
    },
    ref,
  ) => {
    const classes = [
      'ja-button',
      `ja-button--${variant}`,
      `ja-button--${size}`,
      loading ? 'ja-button--loading' : '',
      fullWidth ? 'ja-button--full-width' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        className={classes}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={loading}
        onClick={!isDisabled ? onClick : undefined}
        {...rest}
      >
        {loading && <Spinner />}
        {!loading && iconLeft && (
          <span className="ja-button__icon" aria-hidden="true">
            {iconLeft}
          </span>
        )}
        {children && (
          <span className="ja-button__content">{children}</span>
        )}
        {!loading && iconRight && (
          <span className="ja-button__icon" aria-hidden="true">
            {iconRight}
          </span>
        )}
      </button>
    );
  },
);

Button.displayName = 'Button';

export default Button;
