'use client';

/**
 * Client-side providers shell.
 *
 * T083.1 — Hosts next-themes' ThemeProvider so the existing `.dark { … }`
 * token block in app/tokens.css fires on OS prefers-color-scheme=dark
 * without any new tokens needed. Light remains the default; system
 * override is auto-detected and respected live (no reload required).
 *
 * V4.1 — Hosts the global AskJunoWidget so the floating launcher + right-
 * docked panel are available on every authenticated page. The widget
 * hides itself on /sign-in + /sign-up via usePathname.
 *
 * Why a separate file: `ThemeProvider` + `AskJunoWidget` both need React
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
