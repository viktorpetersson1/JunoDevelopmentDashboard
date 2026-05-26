/**
 * Input — Juno Atlas primitive
 *
 * 32px text input with hairline border and a minimal focus ring (1px black
 * inner shadow, no external glow). Supports labels, hint text, prefix/suffix
 * addons, and invalid state styling.
 *
 * Number inputs automatically apply tabular-nums for aligned values.
 *
 * @example
 * <Input
 *   label="Project Name"
 *   placeholder="e.g. Horizon Tower"
 *   value={name}
 *   onChange={e => setName(e.target.value)}
 * />
 *
 * <Input
 *   label="Budget"
 *   type="number"
 *   prefix="$"
 *   suffix="USD"
 *   value={budget}
 *   onChange={e => setBudget(e.target.value)}
 * />
 *
 * <Input
 *   label="Email"
 *   type="email"
 *   invalid
 *   hint="Must be a valid email address"
 *   value={email}
 *   onChange={e => setEmail(e.target.value)}
 * />
 */

import React, { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import './primitives.css';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  /** Field label rendered above the input */
  label?: string;
  /** Helper or error text rendered below */
  hint?: string;
  /**
   * Field-level error message. When set, the field is automatically
   * marked invalid, the error is rendered in a `.ja-field__error` slot
   * below the input, and `aria-describedby` is wired to it.
   */
  error?: string;
  /** Marks the field invalid — red border, error-coloured hint */
  invalid?: boolean;
  /** Text/short label inside the LEFT edge (renders with bg + border-right) */
  prefix?: ReactNode;
  /** Text/short label inside the RIGHT edge (renders with bg + border-left) */
  suffix?: ReactNode;
  /** Icon inside the LEFT edge, transparent affix (no bg, no border) — for search etc. */
  iconLeft?: ReactNode;
  /** Icon inside the RIGHT edge, transparent affix */
  iconRight?: ReactNode;
  /** Custom node rendered inside the right edge (e.g. password show/hide toggle). */
  trailing?: ReactNode;
  /**
   * Visual variant. `default` = dense 32px app input. `auth` = 44px tall
   * with 16px font-size (iOS Safari no-zoom) — ONLY for /sign-in + /sign-up.
   */
  variant?: 'default' | 'auth';
  /** Controlled value */
  value?: string | number;
  /** Change handler */
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      hint,
      error,
      invalid = false,
      prefix,
      suffix,
      iconLeft,
      iconRight,
      trailing,
      variant = 'default',
      disabled = false,
      id: idProp,
      className = '',
      type = 'text',
      'aria-describedby': ariaDescribedBy,
      ...rest
    },
    ref
  ) => {
    const generatedId = useId();
    const id = idProp ?? generatedId;
    const hintId = `${id}-hint`;
    const errorId = `${id}-error`;
    const hasError = !!error;
    const isInvalid = invalid || hasError;
    const describedBy =
      [ariaDescribedBy, hasError ? errorId : null, hint ? hintId : null]
        .filter(Boolean)
        .join(' ') || undefined;
    const isAuth = variant === 'auth';

    const wrapClasses = [
      'ja-input-wrap',
      isAuth ? 'ja-input-wrap--auth' : '',
      isInvalid ? 'ja-input-wrap--invalid' : '',
      disabled ? 'ja-input-wrap--disabled' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const labelClasses = ['ja-field__label', isAuth ? 'ja-field__label--auth' : '']
      .filter(Boolean)
      .join(' ');

    return (
      <div className={['ja-field', className].filter(Boolean).join(' ')}>
        {label && (
          <label className={labelClasses} htmlFor={id}>
            {label}
          </label>
        )}

        <div className={wrapClasses}>
          {prefix && (
            <span className="ja-input-affix ja-input-affix--prefix" aria-hidden="true">
              {prefix}
            </span>
          )}

          {iconLeft && (
            <span className="ja-input-affix ja-input-affix--icon" aria-hidden="true">
              {iconLeft}
            </span>
          )}

          <input
            ref={ref}
            id={id}
            type={type}
            className="ja-input"
            disabled={disabled}
            aria-invalid={isInvalid || undefined}
            aria-describedby={describedBy}
            {...rest}
          />

          {iconRight && (
            <span className="ja-input-affix ja-input-affix--icon" aria-hidden="true">
              {iconRight}
            </span>
          )}

          {/* `trailing` is rendered as a real interactive slot (not aria-hidden)
              so the password show/hide button can live here and stay accessible. */}
          {trailing && <span className="ja-input-affix ja-input-affix--icon">{trailing}</span>}

          {suffix && (
            <span className="ja-input-affix ja-input-affix--suffix" aria-hidden="true">
              {suffix}
            </span>
          )}
        </div>

        {hasError && (
          <span id={errorId} className="ja-field__error" role="alert">
            {error}
          </span>
        )}

        {hint && !hasError && (
          <span
            id={hintId}
            className={['ja-field__hint', isInvalid ? 'ja-field__hint--error' : '']
              .filter(Boolean)
              .join(' ')}
            role={isInvalid ? 'alert' : undefined}
          >
            {hint}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
