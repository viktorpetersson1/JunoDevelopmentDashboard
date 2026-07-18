'use client';

/**
 * Client-side providers shell.
 *
 * T083.1 — Hosts next-themes' ThemeProvider so the existing `.dark { … }`
 * token block in app/tokens.css fires on OS prefers-color-scheme=dark
 * without any new tokens needed. Light remains the default; system
 * override is auto-detected and respected live (no reload required).
 *
 * AJ-v3 — hosts the Ask Juno WORKING PANE (right dock) on every
 * authenticated page. Opens via the topbar "Ask Juno" button / the
 * `atlas:open-ask-juno` event. Replaces the v2 bottom-right launcher
 * (`ask-juno-launcher.tsx` stays on disk, unmounted — Rule 4); the v2 run
 * console remains available at /agent.
 *
 * Why a separate file: `ThemeProvider` + the pane both need React
 * context / state, so the 'use client' boundary lives here. The root
 * layout stays a Server Component (per Next.js 14 conventions) and just
 * renders this wrapper.
 */

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { AskJunoWidget } from '@/components/widgets/AskJunoWidget';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      // Disable the FOUC flash by skipping the inline script in tests/SSR
      // edge cases — next-themes default is fine; left explicit for clarity.
      disableTransitionOnChange
    >
      {children}
      <AskJunoWidget />
    </ThemeProvider>
  );
}
