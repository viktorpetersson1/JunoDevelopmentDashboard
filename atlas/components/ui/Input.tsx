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

import React, {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import './primitives.css';

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  /** Field label rendered above the input */
  label?: string;
  /** Helper or error text rendered below */
  hint?: string;
  /** Marks the field invalid — red border, error-coloured hint */
  invalid?: boolean;
  /** Text or icon rendered inside the left edge of the input */
  prefix?: ReactNode;
  /** Text or icon rendered inside the right edge of the input */
  suffix?: ReactNode;
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
      invalid = false,
      prefix,
      suffix,
      disabled = false,
      id: idProp,
      className = '',
      type = 'text',
      ...rest
    },
    ref,
  ) => {
    const generatedId = useId();
    const id = idProp ?? generatedId;
    const hintId = `${id}-hint`;

    const wrapClasses = [
      'ja-input-wrap',
      invalid ? 'ja-input-wrap--invalid' : '',
      disabled ? 'ja-input-wrap--disabled' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={['ja-field', className].filter(Boolean).join(' ')}>
        {label && (
          <label className="ja-field__label" htmlFor={id}>
            {label}
          </label>
        )}

        <div className={wrapClasses}>
          {prefix && (
            <span className="ja-input-affix ja-input-affix--prefix" aria-hidden="true">
              {prefix}
            </span>
          )}

          <input
            ref={ref}
            id={id}
            type={type}
            className="ja-input"
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={hint ? hintId : undefined}
            {...rest}
          />

          {suffix && (
            <span className="ja-input-affix ja-input-affix--suffix" aria-hidden="true">
              {suffix}
            </span>
          )}
        </div>

        {hint && (
          <span
            id={hintId}
            className={[
              'ja-field__hint',
              invalid ? 'ja-field__hint--error' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role={invalid ? 'alert' : undefined}
          >
            {hint}
          </span>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';

export default Input;
