'use client';

/**
 * Client wrapper for the index dashboard. Owns scenario-switcher state so
 * the Server Component above can stay async + RSC-friendly.
 *
 * For T046 the scenario CHIP (Pessimistic / Base / Optimistic) was visual-
 * only. V4.12 adds a real ActiveScenarioPicker dropdown in the topbar's
 * `actions` slot that reads/writes the `atlas-active-scenario` cookie;
 * Server Components on portfolio pages then pick the cookie up via
 * lib/scenarios/active.ts::getActiveScenario() and feed it into the
 * aggregator. The 3-class chip is kept as a visual hint of "what kind
 * of scenario am I in" — its onChange remains a no-op for now.
 *
 * Pages that want active-scenario awareness:
 *   pass `activeScenarioId` (from server) and `activeScenarioName`
 *   so the picker hydrates without a flash of "Base case".
 */

import { useState, type ReactNode } from 'react';
import { AppShell } from '@/patterns/AppShell';
import type { ScenarioVariant } from '@/components/layout';
import type { SidebarUser } from '@/components/layout';
import { ActiveScenarioPicker } from './active-scenario-picker';

export function DashboardShell({
  activeHref,
  user,
  children,
  activeScenarioId = null,
  activeScenarioName = 'Base case',
  topbarActions,
}: {
  activeHref: string;
  user: SidebarUser;
  children: ReactNode;
  /** UUID of the active saved scenario, or null when on the base case. */
  activeScenarioId?: string | null;
  /** Display name shown on the picker pill — avoids a "Base case → real name"
   *  flash on first render. */
  activeScenarioName?: string;
  /** Optional extra actions to render alongside the scenario picker. */
  topbarActions?: ReactNode;
}) {
  const [scenario, setScenario] = useState<ScenarioVariant>('base');

  // Compose the topbar action slot: scenario picker first, then any extras
  // the page passes. Using a fragment so the existing Topbar styling
  // (gap, spacing) wraps both cleanly.
  const actions = (
    <>
      <ActiveScenarioPicker
        initialActiveId={activeScenarioId}
        initialDisplayName={activeScenarioName}
      />
      {topbarActions}
    </>
  );

  return (
    <AppShell
      activeHref={activeHref}
      scenario={scenario}
      onScenarioChange={setScenario}
      user={user}
      topbarActions={actions}
    >
      {children}
    </AppShell>
  );
}
