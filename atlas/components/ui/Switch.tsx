/**
 * Switch — Juno Atlas primitive
 *
 * Toggle control. 24×14px track, 12px thumb (10px + 1px inset each side).
 * Off: muted grey track. On: solid black track.
 *
 * Always provide a visible `label` or an external `aria-labelledby` so the
 * role is clear to assistive technology.
 *
 * @example
 * <Switch
 *   label="Enable notifications"
 *   checked={enabled}
 *   onChange={e => setEnabled(e.target.checked)}
 * />
 *
 * // Controlled
 * <Switch
 *   checked={val}
 *   onChange={e => setVal(e.target.checked)}
 *   disabled={isSaving}
 * />
 */

import React, { forwardRef, useId, type InputHTMLAttributes } from 'react';
import './primitives.css';

export interface SwitchProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Whether the toggle is on */
  checked?: boolean;
  /** Called when the toggle changes */
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  /** Disabled state */
  disabled?: boolean;
  /** Visible label text */
  label?: string;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  (
    {
      checked = false,
      onChange,
      disabled = false,
      label,
      id: idProp,
      className = '',
      ...rest
    },
    ref,
  ) => {
    const generatedId = useId();
    const id = idProp ?? generatedId;

    const wrapClasses = [
      'ja-switch-wrap',
      disabled ? 'ja-switch-wrap--disabled' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <label
        className={wrapClasses}
        htmlFor={id}
        aria-label={label ? undefined : 'Toggle'}
      >
        {/* T004 fix: removed aria-hidden from .ja-switch wrapper — it was
            hiding the role=switch input from screen readers. Track + thumb
            are visual-only and aria-hidden individually. */}
        <span className="ja-switch">
          <input
            ref={ref}
            id={id}
            type="checkbox"
            role="switch"
            className="ja-switch__input"
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            aria-checked={checked}
            {...rest}
          />
          <span className="ja-switch__track" aria-hidden="true" />
          <span className="ja-switch__thumb" aria-hidden="true" />
        </span>

        {label && (
          <span className="ja-switch__label">{label}</span>
        )}
      </label>
    );
  },
);

Switch.displayName = 'Switch';

export default Switch;
