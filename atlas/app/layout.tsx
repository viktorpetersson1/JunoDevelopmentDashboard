import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Juno Atlas',
  description: 'Operating dashboard for KP Confidencia / Juno villa development',
  // Favicon — served as a static asset from public/icon.svg. Was previously
  // app/icon.svg (Next.js metadata convention), but @cloudflare/next-on-pages
  // treats app/* files as routes requiring edge runtime, which static SVGs
  // can't satisfy. public/ assets bypass the route layer entirely.
  icons: { icon: '/icon.svg' },
};

/**
 * T082.3 — Supabase preconnect.
 *
 * Saves the ~200-400ms TLS handshake on the first auth call by letting
 * the browser warm the TCP+TLS connection in parallel with HTML parse.
 * Templated from NEXT_PUBLIC_SUPABASE_URL so preview / staging projects
 * preconnect to their own backend, not prod's.
 *
 * `crossOrigin=""` (anonymous) matches how @supabase/ssr issues its fetch
 * requests — Same-origin and Anonymous CORS modes use distinct connection
 * pools, so the preconnect must match or the warmed connection is wasted.
 */
function getSupabaseOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const supabaseOrigin = getSupabaseOrigin();
  return (
    // T083.1: suppressHydrationWarning lets next-themes inject the class=""
    // attribute on <html> before React hydrates without firing a mismatch warning.
    <html lang="en" className={GeistSans.className} suppressHydrationWarning>
      <head>
        {supabaseOrigin && (
          <>
            <link rel="preconnect" href={supabaseOrigin} crossOrigin="" />
            <link rel="dns-prefetch" href={supabaseOrigin} />
          </>
        )}
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
