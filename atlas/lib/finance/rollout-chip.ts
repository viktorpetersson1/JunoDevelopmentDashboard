/**
 * V7 T132 — rollout-pacing chip presentation (pure).
 *
 * Alert-hygiene rules this encodes:
 *  - NEVER render a "start by" date in the past ("Start by Jan 2025" rendered
 *    red 18 months late is what disqualified the app). Overdue → neutral
 *    "Start ASAP" phrasing.
 *  - Unconfigured inputs → an explicit set-target prompt, no alert (Rule 6).
 *  - Red is reserved for a genuine, FUTURE, near deadline (<3 months).
 */
import type { RolloutTriggerResult } from './rollout-trigger';

export interface RolloutChip {
  value: string;
  detail: string;
  color: 'green' | 'amber' | 'red';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtYM(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m ?? 1) - 1] ?? ''} ${y}`;
}

export function rolloutChip(rollout: RolloutTriggerResult): RolloutChip {
  if (rollout.state === 'unconfigured') {
    return {
      value: 'Set target',
      detail: 'Settings → General → Rollout target',
      color: 'green',
    };
  }
  if (rollout.state === 'overdue') {
    return {
      value: 'Start ASAP',
      detail: 'Trailing NPAT below target — the next start unlocks it',
      color: 'green', // neutral phrasing per T132; not an alarm bell on stale state
    };
  }
  const value = rollout.next_start_required_by
    ? `Start by ${fmtYM(rollout.next_start_required_by)}`
    : 'On pace';
  const detail = rollout.rationale.slice(0, 70) + (rollout.rationale.length > 70 ? '…' : '');
  const color: RolloutChip['color'] =
    rollout.state === 'red' ? 'red' : rollout.state === 'amber' ? 'amber' : 'green';
  return { value, detail, color };
}
