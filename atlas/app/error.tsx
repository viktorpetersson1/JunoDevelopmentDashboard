'use client';

/**
 * Root error boundary for the app router.
 *
 * Catches unhandled exceptions in any Server / Client Component below the
 * root layout. Without this file, Next.js falls through to its built-in
 * 500 page that hides the actual error behind a Digest hash — which is
 * what hid the PGRST106 schema-not-exposed bug from us for an hour.
 *
 * In production builds, error.message is still scrubbed by Next for
 * security — only digest survives. We display whatever we get + the
 * digest so the user can paste both into a bug report.
 *
 * Future: when stable, gate the verbose details behind a NODE_ENV check
 * or a feature flag (atlas.show_error_details). For now early in the
 * rollout, max diagnostic transparency.
 */

import { useEffect } from 'react';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Make the digest easy to spot in browser devtools console.
    console.error('[atlas] caught at app/error.tsx:', error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'var(--color-surface-sunken, #f7f7f7)',
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      <section
        style={{
          maxWidth: 560,
          width: '100%',
          background: 'var(--color-surface-base, #fff)',
          border: '1px solid var(--color-border-hairline, #e5e5e5)',
          borderRadius: 14,
          padding: 32,
        }}
      >
        <h1
          style={{
            fontSize: 20,
            fontWeight: 600,
            margin: 0,
            marginBottom: 8,
            color: 'var(--color-negative, #b91c1c)',
          }}
        >
          Something went wrong
        </h1>
        <p
          style={{
            margin: 0,
            marginBottom: 16,
            fontSize: 14,
            color: 'var(--color-text-secondary, #555)',
            lineHeight: 1.5,
          }}
        >
          A server-side error fired while rendering this page. The details
          below help us trace the cause.
        </p>

        <dl
          style={{
            margin: 0,
            marginBottom: 20,
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            columnGap: 12,
            rowGap: 8,
            fontSize: 13,
          }}
        >
          <dt style={{ color: 'var(--color-text-tertiary, #888)' }}>Message</dt>
          <dd
            style={{
              margin: 0,
              fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
              wordBreak: 'break-word',
              color: 'var(--color-text-primary, #111)',
            }}
          >
            {error.message || '(no message — production build)'}
          </dd>

          {error.digest && (
            <>
              <dt style={{ color: 'var(--color-text-tertiary, #888)' }}>Digest</dt>
              <dd
                style={{
                  margin: 0,
                  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                  color: 'var(--color-text-primary, #111)',
                }}
              >
                {error.digest}
              </dd>
            </>
          )}
        </dl>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: '8px 14px',
              background: 'var(--color-accent-base, #131313)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Try again
          </button>
          <a
            href="/sign-in"
            style={{
              padding: '8px 14px',
              background: 'transparent',
              color: 'var(--color-text-primary, #111)',
              border: '1px solid var(--color-border-hairline, #e5e5e5)',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Back to sign-in
          </a>
        </div>

        <p
          style={{
            margin: 0,
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid var(--color-border-subtle, #eee)',
            fontSize: 11,
            color: 'var(--color-text-tertiary, #888)',
          }}
        >
          If this keeps happening, paste the message + digest above into a
          bug report. The full stack lives in the Cloudflare function
          real-time logs.
        </p>
      </section>
    </main>
  );
}
