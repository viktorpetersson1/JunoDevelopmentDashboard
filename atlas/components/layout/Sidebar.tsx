/**
 * Sidebar
 * -------
 * Left navigation rail, 232 px wide, white background, right hairline border.
 * Full viewport height, fixed positioning. Supports grouped navigation sections,
 * an optional logo slot, and a pinned footer with user identity + chevron.
 *
 * Accessibility:
 *   - role="navigation" on the outer element
 *   - aria-label="Main navigation"
 *   - aria-current="page" on the active nav link
 *
 * Tokens: all spacing/color values reference var(--token-name) from tokens.css.
 *
 * @module layout/Sidebar
 */

import React, { forwardRef, type ReactNode } from 'react';
import './layout.css';

// ─── Prop Types ─────────────────────────────────────────────────────────────

export interface SidebarNavItem {
  /** Destination URL. For action items (onClick), use a unique '#…' anchor
   *  string so the active-href check stays predictable; the anchor is
   *  intercepted via preventDefault and won't navigate. */
  href: string;
  /** Display label */
  label: string;
  /** Optional icon element (e.g. SVG) */
  icon?: ReactNode;
  /** Optional badge: numeric count or string label */
  badge?: string | number;
  /** V4.1b — Action items: when set, clicking fires this callback INSTEAD
   *  of navigating. Used by the sidebar Ask Juno CTA to open the global
   *  right-docked widget without leaving the page. The element still
   *  renders as an `<a>` for keyboard + screen-reader compatibility. */
  onClick?: (e: React.MouseEvent) => void;
}

export interface SidebarSection {
  /** Optional muted label above the group (11px, quaternary) */
  label?: string;
  items: SidebarNavItem[];
}

export interface SidebarUser {
  name: string;
  email: string;
  /** URL for user avatar image. Falls back to initials. */
  avatarSrc?: string;
}

export interface SidebarProps {
  /** Navigation sections rendered in order */
  sections: SidebarSection[];
  /** Authenticated user info shown in the footer (when `showFooter` is true) */
  user: SidebarUser;
  /** Href that matches the currently active page */
  activeHref: string;
  /** Brand logo slot — sits above all navigation */
  logo?: ReactNode;
  /** Optional CSS class appended to the root element */
  className?: string;
  /**
   * Render the user-identity footer chip. Defaults to false (V5.2: the user
   * menu moved to the topbar — the sidebar chip had no click handler and
   * confused users). Pass true for storybook / standalone Sidebar usage.
   */
  showFooter?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Derive initials from a name string (up to 2 chars). */
function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n.charAt(0))
    .join('')
    .toUpperCase();
}

/** Chevron icon — used in the footer */
const ChevronIcon = () => (
  <svg
    className="ja-sidebar__footer-chevron"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    aria-hidden="true"
  >
    <path d="M6 4l4 4-4 4" />
  </svg>
);

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Left navigation sidebar.
 *
 * @example
 * ```tsx
 * <Sidebar
 *   sections={[{ label: 'Portfolio', items: [{ href: '/', label: 'Overview' }] }]}
 *   user={{ name: 'Viktor Petersson', email: 'viktor@juno.com' }}
 *   activeHref="/"
 *   logo={<JunoLogo />}
 * />
 * ```
 */
export const Sidebar = forwardRef<HTMLElement, SidebarProps>(function Sidebar(
  { sections, user, activeHref, logo, className, showFooter = false },
  ref
) {
  const rootClass = ['ja-sidebar', className].filter(Boolean).join(' ');

  return (
    <aside ref={ref} className={rootClass} role="navigation" aria-label="Main navigation">
      {/* ── Logo slot ───────────────────────────────────── */}
      {logo && (
        <div className="ja-sidebar__logo" aria-hidden="false">
          {logo}
        </div>
      )}

      {/* ── Navigation sections ─────────────────────────── */}
      <nav className="ja-sidebar__nav" aria-label="Site navigation">
        {sections.map((section, si) => (
          <div key={si} className="ja-sidebar__section">
            {/* Optional section label */}
            {section.label && (
              <div className="ja-sidebar__section-label" aria-hidden="true">
                {section.label}
              </div>
            )}

            {/* Nav items */}
            {section.items.map((item) => {
              const isActive = item.href === activeHref;
              const itemClass = ['ja-sidebar__item', isActive ? 'ja-sidebar__item--active' : '']
                .filter(Boolean)
                .join(' ');

              const handleClick = item.onClick
                ? (e: React.MouseEvent) => {
                    e.preventDefault();
                    item.onClick!(e);
                  }
                : undefined;

              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={itemClass}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={handleClick}
                  role={item.onClick ? 'button' : undefined}
                >
                  {/* Icon */}
                  {item.icon && (
                    <span className="ja-sidebar__item-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                  )}

                  {/* Label */}
                  <span className="ja-sidebar__item-label">{item.label}</span>

                  {/* Badge */}
                  {item.badge !== undefined && (
                    <span className="ja-sidebar__item-badge" aria-label={`${item.badge} items`}>
                      {item.badge}
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── Footer (user identity) — opt-in via showFooter ─────────── */}
      {showFooter && (
        <div
          className="ja-sidebar__footer"
          role="button"
          tabIndex={0}
          aria-label={`${user.name} — account menu`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.currentTarget.click();
            }
          }}
        >
          {/* Avatar */}
          <div className="ja-sidebar__avatar" aria-hidden="true">
            {user.avatarSrc ? (
              // User-uploaded avatar from Supabase Storage — see Avatar.tsx for context
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarSrc} alt={user.name} />
            ) : (
              <span>{getInitials(user.name)}</span>
            )}
          </div>

          {/* Name + email */}
          <div className="ja-sidebar__user-info">
            <div className="ja-sidebar__user-name">{user.name}</div>
            <div className="ja-sidebar__user-email">{user.email}</div>
          </div>

          {/* Chevron */}
          <ChevronIcon />
        </div>
      )}
    </aside>
  );
});

Sidebar.displayName = 'Sidebar';

export default Sidebar;
