/**
 * Drawer — Juno Atlas feedback layer
 *
 * Right-side panel that slides in from the edge. Used for Ask Juno chat
 * and filter panels. Header and footer are sticky; body scrolls.
 *
 * @example
 * ```tsx
 * import { Drawer } from '@juno-atlas/components/feedback';
 *
 * function App() {
 *   const [open, setOpen] = useState(false);
 *   return (
 *     <>
 *       <button onClick={() => setOpen(true)}>Open filters</button>
 *       <Drawer
 *         open={open}
 *         onClose={() => setOpen(false)}
 *         title="Filters"
 *         footer={<button onClick={() => setOpen(false)}>Apply</button>}
 *       >
 *         <p>Filter options…</p>
 *       </Drawer>
 *     </>
 *   );
 * }
 * ```
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import './feedback.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DrawerProps {
  /** Controls visibility */
  open: boolean;
  /** Called when the drawer requests closure */
  onClose: () => void;
  /** Panel heading */
  title?: string;
  /** Panel width in px (default: 480) */
  width?: number;
  /** Body content */
  children?: ReactNode;
  /** Sticky footer slot */
  footer?: ReactNode;
  /** Show a translucent backdrop behind the drawer (default: true) */
  withBackdrop?: boolean;
  /** Additional className for the panel element */
  className?: string;
}

// ---------------------------------------------------------------------------
// Focus trap helpers (mirrors Modal)
// ---------------------------------------------------------------------------

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest('[hidden]') && !el.closest('[aria-hidden="true"]'),
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Drawer = forwardRef<HTMLDivElement, DrawerProps>(
  (
    {
      open,
      onClose,
      title,
      width = 480,
      children,
      footer,
      withBackdrop = true,
      className,
    },
    ref,
  ) => {
    const titleId = useId();
    const panelRef = useRef<HTMLDivElement | null>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    const [mounted, setMounted] = useState(false);
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
      if (open) {
        setExiting(false);
        setMounted(true);
        previousFocusRef.current = document.activeElement as HTMLElement;
      } else if (mounted) {
        setExiting(true);
        // Match ja-drawer-out duration (240ms)
        const timer = setTimeout(() => {
          setMounted(false);
          setExiting(false);
          previousFocusRef.current?.focus();
        }, 240);
        return () => clearTimeout(timer);
      }
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    // Initial focus
    useEffect(() => {
      if (mounted && !exiting && panelRef.current) {
        const focusable = getFocusable(panelRef.current);
        (focusable[0] ?? panelRef.current).focus();
      }
    }, [mounted, exiting]);

    // Body scroll lock
    useEffect(() => {
      if (mounted) {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
      }
    }, [mounted]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
          return;
        }

        if (e.key === 'Tab' && panelRef.current) {
          const focusable = getFocusable(panelRef.current);
          if (focusable.length === 0) { e.preventDefault(); return; }
          // Length-guarded above; non-null assertion satisfies noUncheckedIndexedAccess
          const first = focusable[0]!;
          const last = focusable[focusable.length - 1]!;
          if (e.shiftKey) {
            if (document.activeElement === first) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      },
      [onClose],
    );

    const handleBackdropClick = useCallback(() => {
      onClose();
    }, [onClose]);

    if (!mounted) return null;

    const drawer = (
      <>
        {/* Backdrop */}
        {withBackdrop && (
          <div
            className="ja-drawer-backdrop"
            data-exiting={exiting ? '' : undefined}
            onClick={handleBackdropClick}
            aria-hidden="true"
          />
        )}

        {/* Panel */}
        <div
          ref={(node) => {
            panelRef.current = node as HTMLDivElement;
            if (typeof ref === 'function') ref(node as HTMLDivElement);
            else if (ref) ref.current = node as HTMLDivElement;
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          className={['ja-drawer', className].filter(Boolean).join(' ')}
          data-exiting={exiting ? '' : undefined}
          style={{ width }}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
        >
          {/* Sticky header */}
          <div className="ja-drawer__header">
            {title && (
              <h2 id={titleId} className="ja-drawer__title">
                {title}
              </h2>
            )}
            <button
              className="ja-drawer__close"
              onClick={onClose}
              aria-label="Close panel"
              type="button"
            >
              ×
            </button>
          </div>

          {/* Scrollable body */}
          <div className="ja-drawer__body">{children}</div>

          {/* Sticky footer */}
          {footer && <div className="ja-drawer__footer">{footer}</div>}
        </div>
      </>
    );

    return createPortal(drawer, document.body);
  },
);

Drawer.displayName = 'Drawer';
export default Drawer;
