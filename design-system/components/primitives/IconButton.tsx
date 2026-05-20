/**
 * IconButton — Juno Atlas primitive
 *
 * Square button for icon-only actions. Use `aria-label` to describe the action
 * for screen readers — the icon alone is not enough.
 *
 * Variants:
 *   - `ghost`   : transparent background, #F4F4F2 hover (default)
 *   - `outline` : hairline border, white background
 *
 * @example
 * <IconButton aria-label="Close panel" onClick={onClose}>
 *   <XIcon />
 * </IconButton>
 * <IconButton variant="outline" size="sm" aria-label="Settings">
 *   <GearIcon />
 * </IconButton>
 */

import React, { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react';
import './primitives.css';

export type IconButtonVariant = 'ghost' | 'outline';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style */
  variant?: IconButtonVariant;
  /** Size: sm=28px, md=32px (default), lg=36px */
  size?: IconButtonSize;
  /** Disabled state */
  disabled?: boolean;
  /** Icon element — should be ~14×14px SVG */
  children: ReactNode;
  /** Required for accessibility */
  'aria-label': string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      variant = 'ghost',
      size = 'md',
      disabled = false,
      children,
      className = '',
      type = 'button',
      ...rest
    },
    ref,
  ) => {
    const classes = [
      'ja-icon-button',
      `ja-icon-button--${variant}`,
      `ja-icon-button--${size}`,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        type={type}
        className={classes}
        disabled={disabled}
        aria-disabled={disabled}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

IconButton.displayName = 'IconButton';

export default IconButton;
