/**
 * T103.5 + T103.9 — Section + Card helpers (Ramp-grade visual hierarchy).
 *
 * The pattern Atlas uses everywhere:
 *
 *   <Page>                            (white background)
 *     <Section label="…">             (soft warm-grey container, no border)
 *       <Card>chip A</Card>           (white, hairline border)
 *       <Card>chip B</Card>
 *     </Section>
 *     <Section label="…">
 *       <Card>…</Card>
 *     </Section>
 *   </Page>
 *
 * Tokens live in `app/tokens.css` (--ja-card-* + --ja-section-*) so every
 * surface stays consistent — change a token, every section + card follows.
 *
 * Pure presentation: no client state, server-renderable.
 */

import type { CSSProperties, ReactNode } from 'react';

const sectionStyle: CSSProperties = {
  background: 'var(--ja-section-bg)',
  borderRadius: 'var(--ja-section-radius)',
  padding: 'var(--ja-section-padding)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--ja-card-gap)',
};

const sectionLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--color-text-tertiary)',
  margin: 0,
  marginBottom: 4,
  paddingLeft: 4,
};

export function Section({
  label,
  action,
  children,
  style,
}: {
  /** Small all-caps muted label rendered above the container. */
  label?: string;
  /** Optional right-aligned action (link, button) shown next to the label. */
  action?: ReactNode;
  children: ReactNode;
  /** Optional style override (e.g. {display:'grid'} when chips need a grid). */
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {(label || action) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          {label && <h2 style={sectionLabelStyle}>{label}</h2>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div style={{ ...sectionStyle, ...style }}>{children}</div>
    </div>
  );
}

const cardStyle: CSSProperties = {
  background: 'var(--ja-card-bg)',
  border: 'var(--ja-card-border)',
  borderRadius: 'var(--ja-card-radius)',
  padding: 'var(--ja-card-padding)',
};

export function Card({
  as: As = 'div',
  href,
  style,
  children,
}: {
  /** Render as a different tag (e.g. 'a' for a clickable card). */
  as?: 'div' | 'a' | 'section' | 'article';
  href?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  if (As === 'a' && href) {
    return (
      <a href={href} style={{ ...cardStyle, textDecoration: 'none', color: 'inherit', ...style }}>
        {children}
      </a>
    );
  }
  // Avoid the `As=as Tag` JSX gotcha by switching on string.
  if (As === 'section') {
    return <section style={{ ...cardStyle, ...style }}>{children}</section>;
  }
  if (As === 'article') {
    return <article style={{ ...cardStyle, ...style }}>{children}</article>;
  }
  return <div style={{ ...cardStyle, ...style }}>{children}</div>;
}

/** Token-equivalent for inline styles where you can't use a component
 *  (e.g. Card-like wrappers that need additional flex children). */
export const cardTokens = cardStyle;
export const sectionTokens = sectionStyle;
