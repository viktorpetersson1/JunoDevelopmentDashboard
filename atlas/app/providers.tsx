'use client';

/**
 * T083.1 — Client-side providers shell.
 *
 * Hosts next-themes' ThemeProvider so the existing `.dark { … }` token
 * block in app/tokens.css fires on OS prefers-color-scheme=dark without
 * any new tokens needed. Light remains the default; system override is
 * auto-detected and respected live (no reload required).
 *
 * Why a separate file: `next-themes/ThemeProvider` uses React context,
 * which requires the 'use client' boundary. The root layout stays a
 * Server Component (per Next.js 14 conventions) and just renders this
 * wrapper.
 */

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

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
    </ThemeProvider>
  );
}
