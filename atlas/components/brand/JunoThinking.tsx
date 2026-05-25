/**
 * JunoThinking — animated brand mark for loading / thinking states.
 *
 * Reads as: the platform is processing. Used on:
 *   - Sign-in submit
 *   - Button loading state (via the spinner-replacement integration)
 *   - Ask Juno surface idle / thinking
 *   - Any long-running fetch placeholder
 *
 * The animation rotates the vertical chord around the circle's center
 * — a metronome / sweep that's calm rather than urgent. Honors
 * `prefers-reduced-motion` (animation disabled, opacity pulses gently
 * instead).
 *
 * Inline label is optional. Defaults to no label so the widget can sit
 * alongside other copy without doubling up.
 */

import { JunoMark } from './JunoMark';

export interface JunoThinkingProps {
  /** Pixel size (square) of the mark. Defaults to 32. */
  size?: number;
  /** Optional inline label rendered next to the mark. */
  label?: string;
  /** When true, label is hidden visually but read by screen readers. */
  visuallyHiddenLabel?: boolean;
  /** Layout direction. Defaults to row (mark left, label right). */
  direction?: 'row' | 'column';
  className?: string;
}

export function JunoThinking({
  size = 32,
  label,
  visuallyHiddenLabel = false,
  direction = 'row',
  className,
}: JunoThinkingProps) {
  const showLabel = !!label && !visuallyHiddenLabel;
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label ?? 'Juno is thinking'}
      className={['juno-thinking', className ?? ''].filter(Boolean).join(' ')}
      style={{
        display: 'inline-flex',
        flexDirection: direction,
        alignItems: 'center',
        gap: direction === 'row' ? 12 : 8,
      }}
    >
      <JunoMark size={size} animated />
      {showLabel && (
        <span
          style={{
            fontSize: 13,
            color: 'var(--color-text-secondary)',
            letterSpacing: '-0.01em',
          }}
        >
          {label}
        </span>
      )}
      {visuallyHiddenLabel && label && (
        <span
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
