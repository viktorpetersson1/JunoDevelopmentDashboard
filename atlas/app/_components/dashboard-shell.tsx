'use client';

/**
 * Client wrapper for the dashboard surfaces. Owns scenario-switcher state so
 * the Server Component above can stay async + RSC-friendly.
 *
 * V7 T137 — the topbar 3-chip (Pessimistic / Base / Optimistic) is now the
 * ONLY scenario control and it actually recomputes: clicking a chip POSTs
 * `preset:<class>` (or null for base) to /api/scenarios/active, then
 * router.refresh() re-renders every Server Component against the new cookie.
 * getActiveScenario() maps the cookie to the preset driver sets in
 * lib/calc/baselines.ts, so Home + project pages recompute consistently.
 * The old saved-scenario dropdown (ActiveScenarioPicker) is parked with the
 * scenario library (Rule 4 — component stays on disk).
 *
 * Pages that show engine output pass `activeScenarioClass` (from
 * getActiveScenario) so the chip hydrates to the true state. Pages without
 * engine numbers may omit it; the chip still switches correctly from there.
 */

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/patterns/AppShell';
import type { ScenarioVariant } from '@/components/layout';
import type { SidebarUser } from '@/components/layout';
import { UserMenu } from './user-menu';

export function DashboardShell({
  activeHref,
  user,
  children,
  activeScenarioClass = 'base',
  topbarActions,
}: {
  activeHref: string;
  user: SidebarUser;
  children: ReactNode;
  /** The active preset class from getActiveScenario() — hydrates the chip. */
  activeScenarioClass?: ScenarioVariant;
  /** Back-compat (V4.12) — no longer rendered; the dropdown picker is parked. */
  activeScenarioId?: string | null;
  /** Back-compat (V4.12) — no longer rendered. */
  activeScenarioName?: string;
  /** Optional extra actions to render alongside the user menu. */
  topbarActions?: ReactNode;
}) {
  const router = useRouter();
  const [scenario, setScenario] = useState<ScenarioVariant>(activeScenarioClass);
  const [, startTransition] = useTransition();

  // T137 — the chip writes the cookie, then refreshes the RSC tree.
  const onScenarioChange = (next: ScenarioVariant) => {
    if (next === scenario) return;
    const prev = scenario;
    setScenario(next); // optimistic
    fetch('/api/scenarios/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: next === 'base' ? null : `preset:${next}` }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        startTransition(() => router.refresh());
      })
      .catch(() => {
        setScenario(prev); // roll back on failure — never show a state we didn't set
      });
  };

  const actions = (
    <>
      {topbarActions}
      <UserMenu name={user.name} email={user.email} />
    </>
  );

  return (
    <AppShell
      activeHref={activeHref}
      scenario={scenario}
      onScenarioChange={onScenarioChange}
      user={user}
      topbarActions={actions}
    >
      {children}
    </AppShell>
  );
}
