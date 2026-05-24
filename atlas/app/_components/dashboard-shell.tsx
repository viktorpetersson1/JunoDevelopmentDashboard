'use client';

/**
 * Client wrapper for the index dashboard. Owns scenario-switcher state so
 * the Server Component above can stay async + RSC-friendly.
 *
 * For T046 the scenario switcher is visual-only — clicking a chip updates
 * local state but does NOT re-fetch (server-rendered KPIs are base-case).
 * Scenario-driven recompute lands in W1.8.
 */

import { useState, type ReactNode } from 'react';
import { AppShell } from '@/patterns/AppShell';
import type { ScenarioVariant } from '@/components/layout';
import type { SidebarUser } from '@/components/layout';

export function DashboardShell({
  activeHref,
  user,
  children,
}: {
  activeHref: string;
  user: SidebarUser;
  children: ReactNode;
}) {
  const [scenario, setScenario] = useState<ScenarioVariant>('base');

  return (
    <AppShell
      activeHref={activeHref}
      scenario={scenario}
      onScenarioChange={setScenario}
      user={user}
    >
      {children}
    </AppShell>
  );
}
