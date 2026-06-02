'use client';

/**
 * Last-resort error boundary: catches failures in the ROOT LAYOUT itself
 * (e.g. provider crashes, font loading errors, anything that prevents
 * app/error.tsx from being able to mount its parent layout).
 *
 * Must include its own <html> + <body> because the root layout is the
 * thing that broke.
 *
 * Without this file, Next.js falls through to the static framework 500
 * page that hides the actual error. Same digest convention as error.tsx.
 */

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[atlas] caught at app/global-error.tsx:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 24,
          minHeight: '100vh',
          background: '#f7f7f7',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <section
          style={{
            maxWidth: 560,
            width: '100%',
            background: '#fff',
            border: '1px solid #e5e5e5',
            borderRadius: 'var(--ja-card-radius)',
            padding: 32,
          }}
        >
          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              margin: 0,
              marginBottom: 8,
              color: '#b91c1c',
            }}
          >
            Atlas couldn&apos;t start
          </h1>
          <p
            style={{
              margin: 0,
              marginBottom: 16,
              fontSize: 14,
              color: '#555',
              lineHeight: 1.5,
            }}
          >
            The root layout itself threw. This is rarer than the page-level error boundary catching
            — usually an env/config issue.
          </p>
          <pre
            style={{
              fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
              fontSize: 12,
              background: '#fafafa',
              border: '1px solid #eee',
              borderRadius: 8,
              padding: 12,
              overflow: 'auto',
              margin: 0,
              marginBottom: 16,
              color: '#111',
            }}
          >
            {error.message || '(no message — production build)'}
            {error.digest ? `\n\nDigest: ${error.digest}` : ''}
          </pre>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: '8px 14px',
              background: '#131313',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 400,
            }}
          >
            Try again
          </button>
        </section>
      </body>
    </html>
  );
}
