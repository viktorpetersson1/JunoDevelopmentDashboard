/**
 * V7 T134 — feature flags + surface parking (Rule 4: park, don't delete).
 *
 * The exec dashboard keeps exactly four surfaces (Home · Projects · Pipeline ·
 * Ask Juno). Everything else is PARKED: code, tests, and migrations remain, but
 * navigation drops the entries and the middleware 302s the routes to the
 * nearest surviving surface — unless the surface's flag is present in
 * `ATLAS_FEATURE_FLAGS` (comma-separated env var, already parsed by
 * /api/config), which re-enables it intact for demos.
 *
 * Pure + edge-safe: consumed by the root middleware on every request.
 */

export type AtlasFlag =
  | 'pricing' // /pricing/* + the pricing LLM path + the agent's research_comps tool
  | 'analytics-lab' // sensitivity, stress, scenarios, scenario-modeler, risks, waterfall
  | 'earnings'
  | 'notifications'
  | 'suggestions-page' // the standalone queue page; the queue itself stays (T144 chip)
  | 'users'
  | 'activity'
  | 'cleanup'
  | 'pipeline-capacity'
  | 'project-wizard'; // the 7-step /projects/new wizard (T138 replaces with one form)

/** Parse ATLAS_FEATURE_FLAGS ("pricing, analytics-lab") into a set. */
export function activeFlags(
  env: string | undefined = process.env.ATLAS_FEATURE_FLAGS
): Set<string> {
  return new Set(
    (env ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function flagEnabled(
  flag: AtlasFlag,
  env: string | undefined = process.env.ATLAS_FEATURE_FLAGS
): boolean {
  return activeFlags(env).has(flag);
}

export interface ParkedRoute {
  /** Path prefix ("/pricing" parks /pricing and /pricing/anything). */
  prefix: string;
  flag: AtlasFlag;
  /** 302 target when the flag is off — the nearest surviving surface. */
  redirectTo: string;
}

/**
 * The V7 parking map (order matters — more specific prefixes first). Redirect
 * targets per the T134 requirement to map each parked URL to the nearest
 * surviving surface.
 */
export const PARKED_ROUTES: ParkedRoute[] = [
  // Analytics lab (T135 absorbs capital/cash-schedule/loc/self-funding into Home;
  // these six are the lab surfaces that park outright).
  { prefix: '/analytics/sensitivity', flag: 'analytics-lab', redirectTo: '/dashboard' },
  { prefix: '/analytics/stress', flag: 'analytics-lab', redirectTo: '/dashboard' },
  { prefix: '/analytics/scenario-modeler', flag: 'analytics-lab', redirectTo: '/dashboard' },
  { prefix: '/analytics/scenarios', flag: 'analytics-lab', redirectTo: '/dashboard' },
  { prefix: '/analytics/risks', flag: 'analytics-lab', redirectTo: '/dashboard' },
  { prefix: '/analytics/waterfall', flag: 'analytics-lab', redirectTo: '/dashboard' },
  // Pipeline capacity solver (the Pipeline page itself survives).
  { prefix: '/pipeline/capacity', flag: 'pipeline-capacity', redirectTo: '/pipeline' },
  // Whole-surface parks.
  { prefix: '/pricing', flag: 'pricing', redirectTo: '/dashboard' },
  { prefix: '/earnings', flag: 'earnings', redirectTo: '/dashboard' },
  { prefix: '/notifications', flag: 'notifications', redirectTo: '/dashboard' },
  { prefix: '/suggestions', flag: 'suggestions-page', redirectTo: '/settings' },
  { prefix: '/users', flag: 'users', redirectTo: '/settings' },
  { prefix: '/activity', flag: 'activity', redirectTo: '/settings' },
  { prefix: '/cleanup', flag: 'cleanup', redirectTo: '/dashboard' },
  // NOTE: /projects/new is NOT parked here — T138 replaces the wizard with the
  // simple form in place; parking it before the replacement exists would leave
  // no create path. The 'project-wizard' flag exists for T138's use.
];

/**
 * Resolve a pathname against the parking map: returns the 302 target when the
 * path belongs to a parked surface whose flag is OFF, else null (pass through).
 */
export function parkedRedirect(
  pathname: string,
  env: string | undefined = process.env.ATLAS_FEATURE_FLAGS
): string | null {
  const flags = activeFlags(env);
  for (const r of PARKED_ROUTES) {
    if (pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)) {
      return flags.has(r.flag) ? null : r.redirectTo;
    }
  }
  return null;
}
