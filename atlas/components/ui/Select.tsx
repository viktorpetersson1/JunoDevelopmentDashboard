/**
 * Select — Juno Atlas primitive
 *
 * Native `<select>` element with custom chevron and the same visual treatment
 * as Input: 32px height, 6px radius, hairline border, 1px-black focus ring.
 * Using native select ensures maximum compatibility across environments.
 *
 * @example
 * <Select
 *   label="Scenario"
 *   value={scenario}
 *   onChange={e => setScenario(e.target.value)}
 *   options={[
 *     { value: 'base', label: 'Base Case' },
 *     { value: 'optimistic', label: 'Optimistic' },
 *     { value: 'pessimistic', label: 'Pessimistic' },
 *   ]}
 * />
 */

import React, { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import './primitives.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  /** Field label rendered above the select */
  label?: string;
  /** Array of option items */
  options: SelectOption[];
  /** Placeholder option (unselectable) */
  placeholder?: string;
  /** Controlled value */
  value?: string;
  /** Change handler */
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
  /** Disabled state */
  disabled?: boolean;
}

/** Chevron icon — inline SVG, inherits colour */
const ChevronDown = () => (
  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" aria-hidden="true">
    <path d="M3 5l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      options,
      placeholder,
      value,
      onChange,
      disabled = false,
      id: idProp,
      className = '',
      ...rest
    },
    ref
  ) => {
    const generatedId = useId();
    const id = idProp ?? generatedId;

    const innerClasses = ['ja-select-inner', disabled ? 'ja-select-inner--disabled' : '']
      .filter(Boolean)
      .join(' ');

    return (
      <div className={['ja-select-wrap', className].filter(Boolean).join(' ')}>
        {label && (
          <label className="ja-field__label" htmlFor={id}>
            {label}
          </label>
        )}

        <div className={innerClasses}>
          <select
            ref={ref}
            id={id}
            className="ja-select"
            value={value}
            onChange={onChange}
            disabled={disabled}
            aria-label={label ? undefined : 'Select'}
            {...rest}
          >
            {placeholder && (
              <option value="" disabled hidden>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <span className="ja-select__chevron">
            <ChevronDown />
          </span>
        </div>
      </div>
    );
  }
);

Select.displayName = 'Select';

export default Select;
