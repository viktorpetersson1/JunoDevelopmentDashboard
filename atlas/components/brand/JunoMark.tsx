/**
 * JunoMark — the Juno brand mark.
 *
 * Geometric: a circle with a single vertical chord dividing it. Drawn as
 * a stroke-only SVG so it inherits `currentColor` and scales infinitely.
 * Source-of-truth dimensions: stroke width is 5.5% of the viewBox so the
 * proportions match Viktor's raster reference (~1932×1932 with ~104px
 * stroke).
 *
 * Two variants:
 *   - `<JunoMark />` — static.
 *   - `<JunoMark animated />` — see JunoThinking for the canonical
 *     thinking-state usage; this prop is for one-off integrations.
 *
 * Both variants honor `prefers-reduced-motion` via brand.css.
 */

import './brand.css';

export interface JunoMarkProps {
  /** Pixel size (square). Defaults to 24. */
  size?: number;
  /** Optional className for outer wrapper (use to size by Tailwind class etc.). */
  className?: string;
  /** Set to true to play the thinking animation. Off by default. */
  animated?: boolean;
  /**
   * ARIA label. Default null → marks the SVG as decorative (aria-hidden).
   * Pass a string when the mark stands alone as a logo (no adjacent
   * wordmark) so screen readers can announce it.
   */
  ariaLabel?: string;
}

export function JunoMark({
  size = 24,
  className,
  animated = false,
  ariaLabel,
}: JunoMarkProps) {
  const labelProps = ariaLabel
    ? { role: 'img', 'aria-label': ariaLabel }
    : { 'aria-hidden': true as const };

  // viewBox 100×100 makes math easy. Stroke at 5.5 ≈ 1932px raster proportion.
  // Center 50,50; radius 47.25 leaves stroke fully inside the box.
  return (
    <span
      className={[
        'juno-mark',
        animated ? 'juno-mark--animated' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 100 100"
        fill="none"
        stroke="currentColor"
        strokeWidth="5.5"
        strokeLinecap="round"
        {...labelProps}
      >
        {/* Outer circle */}
        <circle cx="50" cy="50" r="47.25" />
        {/* Vertical chord — full diameter, vertical. The animated variant
            rotates this line via CSS transform on .juno-mark__chord. */}
        <line
          className="juno-mark__chord"
          x1="50"
          y1="2.75"
          x2="50"
          y2="97.25"
        />
      </svg>
    </span>
  );
}
