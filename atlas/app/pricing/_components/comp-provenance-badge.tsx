/**
 * D-026(c) — Visual provenance signal for comp displays.
 *
 * 3 buckets:
 *   - verified      : human-entered (manual / CSV) or real listing source
 *                     (MLS, Compass, OutEast). Treat as ground truth.
 *   - ai_live       : auto-saved from an AI research run with live web search
 *                     (post-D-026(b) fix). Source URL usually present.
 *   - ai_estimated  : AI training-data fallback (pre-D-026(b) era or when the
 *                     web_search beta is unavailable). Verify before pricing
 *                     decisions.
 *
 * Rendered as a low-noise chip — meant to read at a glance without
 * dominating a dense table row.
 */

type Provenance = 'verified' | 'ai_live' | 'ai_estimated';

interface Style {
  label: string;
  bg: string;
  fg: string;
  border: string;
  glyph: string;
  title: string;
}

const STYLES: Record<Provenance, Style> = {
  verified: {
    label: 'Verified',
    bg: '#dcfce7',
    fg: '#166534',
    border: '#86efac',
    glyph: '✓',
    title:
      'Verified — human-entered (manual / CSV) or pulled from a real listing source.',
  },
  ai_live: {
    label: 'AI · live',
    bg: '#dbeafe',
    fg: '#1d4ed8',
    border: '#93c5fd',
    glyph: '◐',
    title:
      'AI research with live web search (Zillow / Realtor / Compass / etc.). Source URL usually attached.',
  },
  ai_estimated: {
    label: 'AI · est',
    bg: '#fef3c7',
    fg: '#92400e',
    border: '#fcd34d',
    glyph: '~',
    title:
      'AI estimate from training-data knowledge (no live web search). Verify before pricing decisions.',
  },
};

export function CompProvenanceBadge({
  provenance,
  variant = 'chip',
}: {
  provenance: Provenance;
  /** 'chip' = labelled pill for the comp library / feed. 'dot' = single-char marker for dense tables. */
  variant?: 'chip' | 'dot';
}) {
  const s = STYLES[provenance];
  if (variant === 'dot') {
    return (
      <span
        title={s.title}
        aria-label={s.title}
        style={{
          display: 'inline-block',
          width: 14,
          height: 14,
          lineHeight: '14px',
          textAlign: 'center',
          fontSize: 10,
          fontWeight: 700,
          borderRadius: 7,
          background: s.bg,
          color: s.fg,
          border: `1px solid ${s.border}`,
          fontFamily: 'inherit',
        }}
      >
        {s.glyph}
      </span>
    );
  }
  return (
    <span
      title={s.title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 10,
        fontWeight: 600,
        padding: '1px 7px',
        borderRadius: 999,
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.border}`,
        whiteSpace: 'nowrap',
        letterSpacing: '0.02em',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span aria-hidden="true">{s.glyph}</span>
      {s.label}
    </span>
  );
}
