/**
 * V4.12 — active-scenario cookie helper.
 *
 * The "active scenario" is the user's currently-selected what-if from
 * the topbar. Persisted as an HTTP cookie so Server Components can pick
 * it up on every render without prop-drilling through every page wrapper.
 *
 * Cookie name: `atlas-active-scenario`
 * Cookie value (V7 T137 contract):
 *   ''                     → base case
 *   'preset:pessimistic'   → PESSIMISTIC_SCENARIO (baselines.ts, no DB read)
 *   'preset:optimistic'    → OPTIMISTIC_SCENARIO (baselines.ts, no DB read)
 *   '<uuid>'               → saved atlas.scenarios row (legacy — the library
 *                            surface is parked, but old cookies keep working)
 *
 * The cookie is set via POST /api/scenarios/active (which validates the
 * value before writing). Read paths fall back to BASELINE_SCENARIO on any
 * missing/invalid/stale value.
 *
 * Why a cookie not a query param: cookies survive client-side navigation
 * without per-link plumbing, persist across page reloads, and avoid
 * polluting URLs with state that's per-session not per-link.
 */

import { cookies } from 'next/headers';
import { BASELINE_SCENARIO, PRESET_SCENARIOS } from '@/lib/calc/baselines';
import { findScenarioById, viewToCalcScenario } from '@/lib/repos/scenarios';
import type { Scenario } from '@/lib/calc/project/types';

export const ACTIVE_SCENARIO_COOKIE = 'atlas-active-scenario';

export type PresetKey = 'pessimistic' | 'optimistic';
export const PRESET_COOKIE_VALUES: Record<PresetKey, string> = {
  pessimistic: 'preset:pessimistic',
  optimistic: 'preset:optimistic',
};

/** Parse a cookie value into a preset key, or null when it isn't a preset. */
export function parsePresetCookie(value: string | undefined): PresetKey | null {
  if (value === 'preset:pessimistic') return 'pessimistic';
  if (value === 'preset:optimistic') return 'optimistic';
  return null;
}

export interface ActiveScenario {
  scenario: Scenario;
  /** True when the active scenario IS the base case. */
  isBase: boolean;
  /** The saved-scenario uuid, the `preset:*` value, or null when on base. */
  activeId: string | null;
  /** The display name — "Base case" for base, otherwise the scenario name. */
  displayName: string;
  /** The topbar 3-chip class this maps to ('base' when a saved custom
   *  scenario doesn't fit the triple). */
  activeClass: 'base' | 'pessimistic' | 'optimistic';
}

const BASE: ActiveScenario = {
  scenario: BASELINE_SCENARIO,
  isBase: true,
  activeId: null,
  displayName: 'Base case',
  activeClass: 'base',
};

/**
 * Returns the currently-active Scenario object for use by the calc engine.
 * Falls back to BASELINE_SCENARIO if no cookie, or the cookie's scenario
 * has since been deleted from atlas.scenarios.
 */
export async function getActiveScenario(): Promise<ActiveScenario> {
  const id = cookies().get(ACTIVE_SCENARIO_COOKIE)?.value;
  if (!id) return BASE;

  // V7 T137 — the topbar presets resolve locally; no DB round-trip.
  const preset = parsePresetCookie(id);
  if (preset) {
    const scenario = PRESET_SCENARIOS[preset];
    return {
      scenario,
      isBase: false,
      activeId: id,
      displayName: scenario.name ?? preset,
      activeClass: preset,
    };
  }

  try {
    const saved = await findScenarioById(id);
    if (!saved) {
      // Stale cookie — fall back to base. The next API call will detect
      // the absence and the toggle can re-prompt.
      return BASE;
    }
    // Saved rows use the ScenarioClass vocabulary ('downside'/'upside') —
    // map onto the topbar triple; anything else reads as base.
    const cls =
      saved.class === 'downside' ? 'pessimistic' : saved.class === 'upside' ? 'optimistic' : 'base';
    return {
      scenario: viewToCalcScenario(saved),
      isBase: false,
      activeId: saved.id,
      displayName: saved.name,
      activeClass: cls,
    };
  } catch {
    // DB blip — fall back to base rather than crashing the page.
    return BASE;
  }
}
