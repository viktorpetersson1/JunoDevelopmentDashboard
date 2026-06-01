/**
 * V4.12 — active-scenario cookie helper.
 *
 * The "active scenario" is the user's currently-selected what-if from
 * the topbar picker. Persisted as an HTTP cookie so Server Components
 * can pick it up on every render without prop-drilling through every
 * page wrapper.
 *
 * Cookie name: `atlas-active-scenario`
 * Cookie value: scenario uuid, or empty string = base case
 *
 * The cookie is set via POST /api/scenarios/active (which validates the
 * scenario exists before writing). Read paths just look up the cookie +
 * fall back to BASELINE_SCENARIO if missing/invalid.
 *
 * Why a cookie not a query param: cookies survive client-side navigation
 * without per-link plumbing, persist across page reloads, and avoid
 * polluting URLs with state that's per-session not per-link.
 */

import { cookies } from 'next/headers';
import { BASELINE_SCENARIO } from '@/lib/calc/baselines';
import { findScenarioById, viewToCalcScenario } from '@/lib/repos/scenarios';
import type { Scenario } from '@/lib/calc/project/types';

export const ACTIVE_SCENARIO_COOKIE = 'atlas-active-scenario';

/**
 * Returns the currently-active Scenario object for use by the calc engine.
 * Falls back to BASELINE_SCENARIO if no cookie or the cookie's scenario
 * has since been deleted from atlas.scenarios.
 *
 * Also returns metadata so the page can render "you're viewing the X
 * scenario" UI without doing a second lookup.
 */
export async function getActiveScenario(): Promise<{
  scenario: Scenario;
  /** True when the active scenario IS the base case. */
  isBase: boolean;
  /** The saved scenario id, or null when on base. */
  activeId: string | null;
  /** The display name — "Base case" for base, otherwise the saved name. */
  displayName: string;
}> {
  const id = cookies().get(ACTIVE_SCENARIO_COOKIE)?.value;
  if (!id) {
    return { scenario: BASELINE_SCENARIO, isBase: true, activeId: null, displayName: 'Base case' };
  }

  try {
    const saved = await findScenarioById(id);
    if (!saved) {
      // Stale cookie — fall back to base. The next API call will detect
      // the absence and the picker can re-prompt.
      return {
        scenario: BASELINE_SCENARIO,
        isBase: true,
        activeId: null,
        displayName: 'Base case',
      };
    }
    return {
      scenario: viewToCalcScenario(saved),
      isBase: false,
      activeId: saved.id,
      displayName: saved.name,
    };
  } catch {
    // DB blip — fall back to base rather than crashing the page.
    return { scenario: BASELINE_SCENARIO, isBase: true, activeId: null, displayName: 'Base case' };
  }
}
