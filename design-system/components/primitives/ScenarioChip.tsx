/**
 * ScenarioChip — Juno Atlas primitive
 *
 * Topbar scenario selector chip (Base / Optimistic / Pessimistic).
 * Variant of FilterChip with distinct visual treatment:
 *   - Inactive: transparent bg, secondary text
 *   - Active: muted bg (#F4F4F2), strong border, primary text,
 *             coloured dot indicator per scenario type
 *
 * Scenario dot colours:
 *   - `base`        : grey (neutral)
 *   - `optimistic`  : green
 *   - `pessimistic` : red
 *   - `custom`      : blue
 *
 * @example
 * {['base', 'optimistic', 'pessimistic'].map(s => (
 *   <ScenarioChip
 *     key={s}
 *     label={s.charAt(0).toUpperCase() + s.slice(1)}
 *     scenario={s as ScenarioType}
 *     active={activeScenario === s}
 *     onClick={() => setActiveScenario(s)}
 *   />
 * ))}
 */

import React, { forwardRef, ButtonHTMLAttributes } from 'react';
import './primitives.css';

export type ScenarioType = 'base' | 'optimistic' | 'pessimistic' | 'custom';

export interface ScenarioChipProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  /** Label text */
  label: string;
  /** Scenario flavour — controls dot colour */
  scenario?: ScenarioType;
  /** Active/selected state */
  active?: boolean;
  /** Click handler */
  onClick?: () => void;
}

export const ScenarioChip = forwardRef<HTMLButtonElement, ScenarioChipProps>(
  (
    {
      label,
      scenario = 'base',
      active = false,
      onClick,
      className = '',
      disabled,
      ...rest
    },
    ref,
  ) => {
    const classes = [
      'ja-scenario-chip',
      `ja-scenario-chip--${scenario}`,
      active ? 'ja-scenario-chip--active' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        type="button"
        className={classes}
        onClick={onClick}
        disabled={disabled}
        aria-pressed={active}
        {...rest}
      >
        <span className="ja-scenario-chip__dot" aria-hidden="true" />
        <span>{label}</span>
      </button>
    );
  },
);

ScenarioChip.displayName = 'ScenarioChip';

export default ScenarioChip;
