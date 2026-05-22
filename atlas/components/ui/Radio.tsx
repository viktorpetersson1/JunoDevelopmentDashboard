/**
 * Radio — Juno Atlas primitive
 *
 * 14×14px circular radio button. Unchecked: hairline border, white fill.
 * Checked: solid black ring with centred white inner dot.
 *
 * Group radios using a shared `name` prop (native HTML radio behaviour).
 *
 * @example
 * <Radio
 *   name="scenario"
 *   value="base"
 *   label="Base Case"
 *   checked={scenario === 'base'}
 *   onChange={e => setScenario(e.target.value)}
 * />
 * <Radio
 *   name="scenario"
 *   value="optimistic"
 *   label="Optimistic"
 *   checked={scenario === 'optimistic'}
 *   onChange={e => setScenario(e.target.value)}
 * />
 */

import React, { forwardRef, useId, type InputHTMLAttributes } from 'react';
import './primitives.css';

export interface RadioProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Whether this option is selected */
  checked?: boolean;
  /** Called on selection */
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  /** Disabled state */
  disabled?: boolean;
  /** Visible label text */
  label?: string;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(
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
      'ja-radio-wrap',
      disabled ? 'ja-radio-wrap--disabled' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <label className={wrapClasses} htmlFor={id}>
        <span className="ja-radio">
          <input
            ref={ref}
            id={id}
            type="radio"
            className="ja-radio__input"
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            aria-checked={checked}
            {...rest}
          />
          <span className="ja-radio__circle">
            <span className="ja-radio__dot" />
          </span>
        </span>

        {label && (
          <span className="ja-radio__label">{label}</span>
        )}
      </label>
    );
  },
);

Radio.displayName = 'Radio';

export default Radio;
