/**
 * Breadcrumb — Juno Atlas primitive
 *
 * Horizontal navigation trail with chevron separators. The last item
 * represents the current page: it is rendered as plain text in primary
 * colour with no link. Earlier items are secondary colour and become
 * primary on hover.
 *
 * Follows WAI-ARIA breadcrumb navigation pattern (`nav aria-label="breadcrumb"`
 * + `aria-current="page"` on last item).
 *
 * @example
 * <Breadcrumb
 *   items={[
 *     { label: 'Projects', href: '/projects' },
 *     { label: 'Horizon Tower', href: '/projects/horizon' },
 *     { label: 'Capital' },
 *   ]}
 * />
 */

import React from 'react';
import './primitives.css';

export interface BreadcrumbItem {
  /** Display text */
  label: string;
  /** Navigation target — omit for current page */
  href?: string;
}

export interface BreadcrumbProps {
  /** Ordered list of path segments. Last item = current page. */
  items: BreadcrumbItem[];
  /** Optional extra class on the nav element */
  className?: string;
}

/** Chevron right — 12×12px, inherits colour */
const ChevronRight = () => (
  <svg
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4.5 2.5l3 3.5-3 3.5" />
  </svg>
);

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, className = '' }) => {
  if (!items.length) return null;

  return (
    <nav aria-label="Breadcrumb" className={className || undefined}>
      <ol className="ja-breadcrumb">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.label}-${index}`} className="ja-breadcrumb__item">
              {isLast ? (
                <span className="ja-breadcrumb__current" aria-current="page">
                  {item.label}
                </span>
              ) : (
                <>
                  {item.href ? (
                    <a className="ja-breadcrumb__link" href={item.href}>
                      {item.label}
                    </a>
                  ) : (
                    <span className="ja-breadcrumb__link" role="button" tabIndex={0}>
                      {item.label}
                    </span>
                  )}
                  <span className="ja-breadcrumb__sep">
                    <ChevronRight />
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumb;
