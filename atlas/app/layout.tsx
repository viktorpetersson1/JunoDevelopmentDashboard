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

/**
 * V4-fix — service-worker kill switch.
 *
 * Inline script that runs on every HTML load. Unregisters any service
 * worker the browser may have cached from a long-dead prior deploy +
 * clears every cache it can reach. Belt + braces with public/sw.js
 * (which kills itself the standard way when the browser checks for SW
 * updates).
 *
 * Why inline: the SW intercepts navigation BEFORE any external script
 * loads. The only code guaranteed to run as the page parses is an
 * inline <script> in <head>. We trade ~400 bytes of HTML for one of the
 * worst chronic bugs on the platform.
 *
 * Safe by construction: no-op when no SW exists, no-op on browsers that
 * don't support SW, runs once per navigation. Errors swallowed.
 */
const SW_KILL_SCRIPT = `
(function(){
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(regs){
        regs.forEach(function(r){ try { r.unregister(); } catch(_){} });
      }).catch(function(){});
    }
    if (typeof caches !== 'undefined' && caches.keys) {
      caches.keys().then(function(keys){
        keys.forEach(function(k){ try { caches.delete(k); } catch(_){} });
      }).catch(function(){});
    }
  } catch(_) {}
})();
`;

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
        {/* SW kill switch — see SW_KILL_SCRIPT comment above. Runs early
            in the parse so any stale-SW-intercepted HTML still gets the
            cleanup poke. dangerouslySetInnerHTML is the only way to emit
            a literal <script> from RSC without React re-escaping it. */}
        <script dangerouslySetInnerHTML={{ __html: SW_KILL_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
