/**
 * Branded 404 — replaces Next's default "404 | This page could not be found".
 * Used whenever notFound() is called or a path doesn't match any route.
 *
 * Server Component (no client state needed).
 */

import Link from 'next/link';
import { JunoMark } from '@/components/brand';

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'var(--color-surface-sunken, #f7f7f7)',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      <section
        style={{
          maxWidth: 480,
          width: '100%',
          background: 'var(--color-surface-base, #fff)',
          border: '1px solid var(--color-border-hairline, #e5e5e5)',
          borderRadius: 'var(--ja-card-radius)',
          padding: 32,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div style={{ color: 'var(--color-text-primary, #111)' }}>
          <JunoMark size={48} ariaLabel="Juno" />
        </div>
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              margin: 0,
              marginBottom: 6,
              color: 'var(--color-text-primary, #111)',
            }}
          >
            Page not found
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: 'var(--color-text-secondary, #555)',
              lineHeight: 1.5,
            }}
          >
            The URL you tried doesn&apos;t match any route in Atlas. It may have moved, or you may
            have followed a stale link.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link
            href="/"
            style={{
              padding: '8px 14px',
              background: 'var(--color-accent-base, #131313)',
              color: '#fff',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 400,
            }}
          >
            Go to dashboard
          </Link>
          <Link
            href="/projects"
            style={{
              padding: '8px 14px',
              background: 'transparent',
              color: 'var(--color-text-primary, #111)',
              border: '1px solid var(--color-border-hairline, #e5e5e5)',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 400,
            }}
          >
            Browse projects
          </Link>
        </div>
      </section>
    </main>
  );
}
