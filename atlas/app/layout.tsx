import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={GeistSans.className}>
      <body>{children}</body>
    </html>
  );
}
