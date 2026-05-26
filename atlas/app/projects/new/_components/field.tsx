'use client';

/**
 * Shared form field primitive for the wizard steps. Standardises label +
 * input + error + hint layout so each step is just a list of <Field>s.
 *
 * Supports text, number, select, date (month). Use the `kind` prop.
 */

import type { ChangeEvent, ReactNode } from 'react';

export interface FieldProps {
  label: string;
  /** Field key — only used for the for/id attr linking. */
  name: string;
  kind: 'text' | 'url' | 'number' | 'integer' | 'month' | 'select';
  value: string | number | null;
  onChange: (v: string | number | null) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  /** select kind only */
  options?: Array<{ value: string; label: string }>;
  /** number/integer: min */
  min?: number;
  /** number/integer: max */
  max?: number;
  /** number/integer: step (default 1 for integer, 0.01 for number) */
  step?: number;
  placeholder?: string;
  /** Trailing inline note (e.g. "/sqft", "months"). */
  suffix?: ReactNode;
}

export function Field({
  label,
  name,
  kind,
  value,
  onChange,
  error,
  hint,
  required,
  options,
  min,
  max,
  step,
  placeholder,
  suffix,
}: FieldProps) {
  const id = `wizard-${name}`;

  function handleText(e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const v = e.target.value;
    onChange(v === '' ? null : v);
  }

  function handleNumber(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (raw === '') {
      onChange(null);
      return;
    }
    const n = kind === 'integer' ? Number.parseInt(raw, 10) : Number.parseFloat(raw);
    onChange(Number.isFinite(n) ? n : null);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    fontSize: 14,
    border: `1px solid ${error ? 'var(--color-negative, #dc2626)' : 'var(--color-border-hairline)'}`,
    borderRadius: 8,
    background: 'var(--color-surface-base)',
    color: 'var(--color-text-primary)',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label
        htmlFor={id}
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--color-text-secondary)',
        }}
      >
        {label}
        {required && (
          <span style={{ color: 'var(--color-negative, #dc2626)', marginLeft: 2 }}>*</span>
        )}
      </label>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
        {kind === 'select' ? (
          <select
            id={id}
            value={typeof value === 'string' ? value : (value ?? '')}
            onChange={handleText}
            style={{ ...inputStyle, paddingRight: 28 }}
          >
            {options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : kind === 'number' || kind === 'integer' ? (
          <input
            id={id}
            type="number"
            value={value == null ? '' : String(value)}
            onChange={handleNumber}
            min={min}
            max={max}
            step={step ?? (kind === 'integer' ? 1 : 0.01)}
            placeholder={placeholder}
            style={{
              ...inputStyle,
              fontVariantNumeric: 'tabular-nums',
              paddingRight: suffix ? 56 : 12,
            }}
          />
        ) : kind === 'month' ? (
          <input
            id={id}
            type="month"
            value={typeof value === 'string' ? value : ''}
            onChange={handleText}
            placeholder={placeholder}
            style={inputStyle}
          />
        ) : (
          <input
            id={id}
            type={kind === 'url' ? 'url' : 'text'}
            value={typeof value === 'string' ? value : ''}
            onChange={handleText}
            placeholder={placeholder}
            style={inputStyle}
          />
        )}
        {suffix && (
          <span
            style={{
              position: 'absolute',
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 11,
              color: 'var(--color-text-tertiary)',
              pointerEvents: 'none',
            }}
          >
            {suffix}
          </span>
        )}
      </div>

      {error ? (
        <span
          role="alert"
          style={{ fontSize: 11, color: 'var(--color-negative, #dc2626)' }}
        >
          {error}
        </span>
      ) : hint ? (
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{hint}</span>
      ) : null}
    </div>
  );
}
