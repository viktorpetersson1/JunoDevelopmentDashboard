/**
 * Modal — Juno Atlas feedback layer
 *
 * Centered dialog rendered via React portal. Supports backdrop dismiss,
 * Escape-to-close, focus trapping, and exit animations.
 *
 * @example
 * ```tsx
 * import { Modal } from '@juno-atlas/components/feedback';
 *
 * function App() {
 *   const [open, setOpen] = useState(false);
 *   return (
 *     <>
 *       <button onClick={() => setOpen(true)}>Open</button>
 *       <Modal
 *         open={open}
 *         onClose={() => setOpen(false)}
 *         title="Confirm action"
 *         description="This cannot be undone."
 *         footer={
 *           <>
 *             <button onClick={() => setOpen(false)}>Cancel</button>
 *             <button>Confirm</button>
 *           </>
 *         }
 *       >
 *         <p>Modal body content here.</p>
 *       </Modal>
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

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  /** Controls visibility */
  open: boolean;
  /** Called when the modal requests closure (backdrop click, Esc key, × button) */
  onClose: () => void;
  /** Heading text — rendered as h2, linked via aria-labelledby */
  title?: string;
  /** Supplemental description rendered below title */
  description?: string;
  /** Slot for action buttons rendered in the modal footer */
  footer?: ReactNode;
  /** Body content */
  children?: ReactNode;
  /**
   * Max-width breakpoint:
   * - sm → 400px
   * - md → 560px  (default)
   * - lg → 720px
   * - xl → 920px
   */
  size?: ModalSize;
  /** Whether clicking the backdrop closes the modal (default: true) */
  dismissOnBackdrop?: boolean;
  /** Additional className forwarded to the modal card */
  className?: string;
}

// ---------------------------------------------------------------------------
// Focus trap helper
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
    (el) => !el.closest('[hidden]') && !el.closest('[aria-hidden="true"]')
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Modal = forwardRef<HTMLDivElement, ModalProps>(
  (
    {
      open,
      onClose,
      title,
      description,
      footer,
      children,
      size = 'md',
      dismissOnBackdrop = true,
      className,
    },
    ref
  ) => {
    const titleId = useId();
    const descId = useId();
    const backdropRef = useRef<HTMLDivElement | null>(null);
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    // Exit-animation state: we keep the DOM for --duration-base after close
    const [mounted, setMounted] = useState(false);
    const [exiting, setExiting] = useState(false);

    // Trigger mount / exit
    useEffect(() => {
      if (open) {
        setExiting(false);
        setMounted(true);
        previousFocusRef.current = document.activeElement as HTMLElement;
      } else if (mounted) {
        setExiting(true);
        const timer = setTimeout(() => {
          setMounted(false);
          setExiting(false);
          // Restore focus
          previousFocusRef.current?.focus();
        }, 180);
        return () => clearTimeout(timer);
      }
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    // Initial focus
    useEffect(() => {
      if (mounted && !exiting && dialogRef.current) {
        const focusable = getFocusable(dialogRef.current);
        (focusable[0] ?? dialogRef.current).focus();
      }
    }, [mounted, exiting]);

    // Lock body scroll
    useEffect(() => {
      if (mounted) {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
          document.body.style.overflow = prev;
        };
      }
    }, [mounted]);

    // Keyboard handlers
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
          return;
        }

        if (e.key === 'Tab' && dialogRef.current) {
          const focusable = getFocusable(dialogRef.current);
          if (focusable.length === 0) {
            e.preventDefault();
            return;
          }
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
      [onClose]
    );

    const handleBackdropClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (dismissOnBackdrop && e.target === backdropRef.current) {
          onClose();
        }
      },
      [dismissOnBackdrop, onClose]
    );

    if (!mounted) return null;

    const hasHeader = !!(title || description);

    const modal = (
      <div
        ref={backdropRef}
        className="ja-modal-backdrop"
        data-exiting={exiting ? '' : undefined}
        onClick={handleBackdropClick}
        onKeyDown={handleKeyDown}
        aria-modal="true"
      >
        <div
          ref={(node) => {
            dialogRef.current = node as HTMLDivElement;
            if (typeof ref === 'function') ref(node as HTMLDivElement);
            else if (ref) ref.current = node as HTMLDivElement;
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          aria-describedby={description ? descId : undefined}
          className={['ja-modal', `ja-modal--${size}`, className].filter(Boolean).join(' ')}
          data-exiting={exiting ? '' : undefined}
          tabIndex={-1}
        >
          {/* Header */}
          <div
            className={hasHeader ? 'ja-modal__header' : 'ja-modal__header ja-modal__header--empty'}
          >
            {hasHeader && (
              <div className="ja-modal__title-group">
                {title && (
                  <h2 id={titleId} className="ja-modal__title">
                    {title}
                  </h2>
                )}
                {description && (
                  <p id={descId} className="ja-modal__description">
                    {description}
                  </p>
                )}
              </div>
            )}
            <button
              className="ja-modal__close"
              onClick={onClose}
              aria-label="Close dialog"
              type="button"
            >
              ×
            </button>
          </div>

          {/* Body */}
          {children && <div className="ja-modal__body">{children}</div>}

          {/* Footer */}
          {footer && <div className="ja-modal__footer">{footer}</div>}
        </div>
      </div>
    );

    return createPortal(modal, document.body);
  }
);

Modal.displayName = 'Modal';
export default Modal;
