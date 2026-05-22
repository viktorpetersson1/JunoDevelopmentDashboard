/**
 * Checkbox — Juno Atlas primitive
 *
 * 14×14px square checkbox with 3px radius. Hairline border in unchecked state,
 * solid black fill when checked or indeterminate. White SVG check mark.
 *
 * Supports three states: unchecked, checked, indeterminate (for table header
 * "select all" with partial selection).
 *
 * @example
 * <Checkbox
 *   label="Include contingency"
 *   checked={checked}
 *   onChange={e => setChecked(e.target.checked)}
 * />
 *
 * // Indeterminate (select-all)
 * <Checkbox
 *   indeterminate={someSelected && !allSelected}
 *   checked={allSelected}
 *   onChange={handleSelectAll}
 * />
 */

import React, { forwardRef, useId, useEffect, useRef, type InputHTMLAttributes } from 'react';
import './primitives.css';

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Checked state */
  checked?: boolean;
  /** Indeterminate — overrides checked visually; both can be true */
  indeterminate?: boolean;
  /** Called when the checkbox changes */
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  /** Disabled state */
  disabled?: boolean;
  /** Visible label text */
  label?: string;
}

/** 10×8px check path */
const CheckIcon = () => (
  <svg
    width="10"
    height="8"
    viewBox="0 0 10 8"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M1 4l3 3 5-6" />
  </svg>
);

/** Minus / dash for indeterminate */
const IndeterminateIcon = () => (
  <svg
    width="8"
    height="2"
    viewBox="0 0 8 2"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M1 1h6" />
  </svg>
);

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      checked = false,
      indeterminate = false,
      onChange,
      disabled = false,
      label,
      id: idProp,
      className = '',
      ...rest
    },
    forwardedRef,
  ) => {
    const generatedId = useId();
    const id = idProp ?? generatedId;
    const innerRef = useRef<HTMLInputElement | null>(null);

    // Sync indeterminate DOM property (not an HTML attribute)
    useEffect(() => {
      const el = innerRef.current;
      if (el) {
        el.indeterminate = indeterminate;
        // Also set data attr so CSS sibling selector can apply styles
        if (indeterminate) {
          el.setAttribute('data-indeterminate', 'true');
        } else {
          el.removeAttribute('data-indeterminate');
        }
      }
    }, [indeterminate]);

    const wrapClasses = [
      'ja-checkbox-wrap',
      disabled ? 'ja-checkbox-wrap--disabled' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <label className={wrapClasses} htmlFor={id}>
        <span className="ja-checkbox">
          <input
            ref={(node) => {
              // Merge forwarded ref + inner ref
              innerRef.current = node;
              if (typeof forwardedRef === 'function') {
                forwardedRef(node);
              } else if (forwardedRef) {
                (forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
              }
            }}
            id={id}
            type="checkbox"
            className="ja-checkbox__input"
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            aria-checked={indeterminate ? 'mixed' : checked}
            {...rest}
          />
          <span className="ja-checkbox__box">
            <span className="ja-checkbox__check">
              <CheckIcon />
            </span>
            <span className="ja-checkbox__indeterminate">
              <IndeterminateIcon />
            </span>
          </span>
        </span>

        {label && (
          <span className="ja-checkbox__label">{label}</span>
        )}
      </label>
    );
  },
);

Checkbox.displayName = 'Checkbox';

export default Checkbox;
