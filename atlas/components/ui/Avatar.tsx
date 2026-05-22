/**
 * Avatar — Juno Atlas primitive
 *
 * Circular avatar. Falls back to auto-extracted initials when no `src` is
 * provided. Supports optional background colour override for identity colour-
 * coding (e.g., per-user tints in a project team list).
 *
 * Sizes: sm=24px, md=32px, lg=40px, xl=56px
 *
 * @example
 * // Photo avatar
 * <Avatar src="/avatars/alice.jpg" name="Alice Chen" size="md" />
 *
 * // Initials fallback
 * <Avatar name="Viktor Reeves" size="lg" />
 *
 * // Custom tint
 * <Avatar name="Marco Polo" color="#D1FAE5" size="sm" />
 */

import React, { forwardRef, useState, type HTMLAttributes } from 'react';
import './primitives.css';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'color'> {
  /** Full name — used to derive initials and as aria-label */
  name: string;
  /** Optional photo URL — falls back to initials on error */
  src?: string;
  /** Size: sm=24, md=32, lg=40, xl=56 */
  size?: AvatarSize;
  /** Override the background colour of the initials avatar */
  color?: string;
}

/** Extract up to 2 initials from a name string */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return '?';
  const firstChar = first.charAt(0);
  if (parts.length === 1) return firstChar.toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return (firstChar + last.charAt(0)).toUpperCase();
}

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(
  ({ name, src, size = 'md', color, className = '', style, ...rest }, ref) => {
    const [imgError, setImgError] = useState(false);
    const showImage = Boolean(src) && !imgError;
    const initials = getInitials(name);

    const classes = [
      'ja-avatar',
      `ja-avatar--${size}`,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const inlineStyle: React.CSSProperties = {
      ...(color && !showImage ? { backgroundColor: color } : {}),
      ...style,
    };

    return (
      <span
        ref={ref}
        className={classes}
        style={inlineStyle}
        role="img"
        aria-label={name}
        title={name}
        {...rest}
      >
        {showImage && (
          // Avatars accept arbitrary user-uploaded URLs (Supabase Storage,
          // external profile pics). next/image's loader contract requires
          // configured domains/loaders; native <img> is appropriate here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="ja-avatar__img"
            src={src}
            alt={name}
            onError={() => setImgError(true)}
          />
        )}
        {!showImage && (
          <span className="ja-avatar__initials" aria-hidden="true">
            {initials}
          </span>
        )}
      </span>
    );
  },
);

Avatar.displayName = 'Avatar';

export default Avatar;
