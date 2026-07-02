/**
 * V7 T132 — alert hygiene for the rollout-pacing chip.
 * The regression this pins: an OVERDUE trigger must never render a past
 * "Start by <date>" in red (the "Start by Jan 2025" bug).
 */
import { describe, it, expect } from 'vitest';
import { rolloutChip } from '@/lib/finance/rollout-chip';
import { computeRolloutTrigger } from '@/lib/finance/rollout-trigger';
import type { RolloutTriggerResult } from '@/lib/finance/rollout-trigger';

const base: RolloutTriggerResult = {
  state: 'green',
  next_start_required_by: null,
  required_annual_npat_usd: 8_000_000,
  current_trailing_12mo_npat_usd: 9_000_000,
  shortfall_month: null,
  months_until_required: null,
  rationale: 'On pace.',
};

describe('rolloutChip (T132 alert hygiene)', () => {
  it('OVERDUE never renders a past date and is not red (neutral phrasing)', () => {
    // End-to-end through the real trigger: shortfall already behind us.
    const overdue = computeRolloutTrigger({
      projects: [],
      target_annual_npat_usd: 8_000_000,
      fixed_overhead_annual_usd: 0,
      project_time_to_npat_months: 18,
      today_month: '2026-07',
    });
    expect(overdue.state).toBe('overdue');
    const chip = rolloutChip(overdue);
    expect(chip.value).toBe('Start ASAP');
    expect(chip.value).not.toMatch(/20\d\d/); // no date at all, so never a past one
    expect(chip.color).not.toBe('red');
    expect(chip.detail).toMatch(/trailing NPAT below target/i);
  });

  it('unconfigured renders the set-target prompt, no alert (Rule 6)', () => {
    const chip = rolloutChip({ ...base, state: 'unconfigured', rationale: '' });
    expect(chip.value).toBe('Set target');
    expect(chip.color).toBe('green');
  });

  it('a genuine near deadline (future) stays red with the date', () => {
    const chip = rolloutChip({
      ...base,
      state: 'red',
      next_start_required_by: '2026-09',
      months_until_required: 2,
      rationale: 'Dips below bar in 2027-03.',
    });
    expect(chip.value).toBe('Start by Sep 2026');
    expect(chip.color).toBe('red');
  });

  it('green/on-pace renders quietly', () => {
    const chip = rolloutChip(base);
    expect(chip.value).toBe('On pace');
    expect(chip.color).toBe('green');
  });
});
