'use client';

/**
 * V4.11 — Generic "this tab links to a full standalone surface" panel.
 *
 * Used by Settings → History (links to /activity, V4.9) and Settings →
 * Suggestions (links to /suggestions, V4.8). Keeps the INVENTORY §23-26
 * tab structure honest without duplicating the full surface inside the
 * Settings shell.
 */

import Link from 'next/link';

export function LinkTab({
  title,
  description,
  href,
  ctaLabel,
}: {
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
}) {
  return (
    <div
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 14,
        padding: 32,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--color-text-primary)',
        }}
      >
        {title}
      </h2>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: 'var(--color-text-secondary)',
          maxWidth: 480,
        }}
      >
        {description}
      </p>
      <Link
        href={href}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '8px 14px',
          fontSize: 13,
          fontWeight: 500,
          color: '#fff',
          background: 'var(--color-accent-base, #131313)',
          borderRadius: 8,
          textDecoration: 'none',
        }}
      >
        {ctaLabel} →
      </Link>
    </div>
  );
}
