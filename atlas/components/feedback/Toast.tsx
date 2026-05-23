/**
 * Toast + ToastProvider — Juno Atlas feedback layer
 *
 * Transient bottom-right notification stack. Use the `useToast()` hook to
 * imperatively trigger toasts from anywhere in the component tree.
 *
 * @example
 * ```tsx
 * // 1. Wrap your app (or a subtree) with ToastProvider:
 * import { ToastProvider } from '@juno-atlas/components/feedback';
 * <ToastProvider><App /></ToastProvider>
 *
 * // 2. Trigger from any component:
 * import { useToast } from '@juno-atlas/components/feedback';
 *
 * function SaveButton() {
 *   const { toast } = useToast();
 *   return (
 *     <button
 *       onClick={() =>
 *         toast({
 *           title: 'Saved',
 *           description: 'Your changes have been saved.',
 *           variant: 'positive',
 *         })
 *       }
 *     >
 *       Save
 *     </button>
 *   );
 * }
 * ```
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import './feedback.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastVariant = 'default' | 'positive' | 'warning' | 'negative';

export interface ToastItem {
  id: string;
  variant?: ToastVariant;
  title: string;
  description?: string;
  /** Auto-dismiss delay in ms. Use 0 to disable. Default: 5000 */
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface ToastOptions extends Omit<ToastItem, 'id'> {
  id?: string;
}

export interface ToastContextValue {
  /** Add a new toast. Returns its generated id. */
  toast: (options: ToastOptions) => string;
  /** Remove a toast by id */
  dismiss: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 5000;

// ---------------------------------------------------------------------------
// ToastProvider
// ---------------------------------------------------------------------------

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // Track which toasts are animating out
  const [exiting, setExiting] = useState<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    // Clear auto-dismiss timer
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    // Mark as exiting → triggers CSS exit animation
    setExiting((prev) => new Set(prev).add(id));
    // Remove after animation completes (180ms)
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      setExiting((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 180);
  }, []);

  const toast = useCallback(
    (options: ToastOptions): string => {
      const id = options.id ?? `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const duration = options.duration ?? DEFAULT_DURATION;

      setToasts((prev) => {
        // If already present, replace
        const existing = prev.find((t) => t.id === id);
        if (existing) {
          return prev.map((t) => (t.id === id ? { ...options, id } : t));
        }
        // Limit visible stack to MAX_VISIBLE — drop oldest if needed
        const next = [...prev, { ...options, id, duration }];
        return next.slice(-MAX_VISIBLE);
      });

      // Auto-dismiss
      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timersRef.current.set(id, timer);
      }

      return id;
    },
    [dismiss],
  );

  // Cleanup on unmount
  useEffect(() => {
    // Capture the current value so the cleanup uses the same Map instance
    // (react-hooks/exhaustive-deps guard).
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      {createPortal(
        <div
          className="ja-toast-region"
          role="region"
          aria-label="Notifications"
          aria-live="polite"
          aria-atomic="false"
        >
          {toasts.map((item) => (
            <ToastCard
              key={item.id}
              item={item}
              isExiting={exiting.has(item.id)}
              onDismiss={() => dismiss(item.id)}
            />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Individual Toast card (internal)
// ---------------------------------------------------------------------------

interface ToastCardProps {
  item: ToastItem;
  isExiting: boolean;
  onDismiss: () => void;
}

function ToastCard({ item, isExiting, onDismiss }: ToastCardProps) {
  const { variant = 'default', title, description, action } = item;

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'ja-toast',
        `ja-toast--${variant}`,
      ].join(' ')}
      data-exiting={isExiting ? '' : undefined}
    >
      <div className="ja-toast__content">
        <p className="ja-toast__title">{title}</p>
        {description && (
          <p className="ja-toast__description">{description}</p>
        )}
        {action && (
          <button
            type="button"
            className="ja-toast__action"
            onClick={() => {
              action.onClick();
              onDismiss();
            }}
          >
            {action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        className="ja-toast__dismiss"
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public Toast component (standalone, unmanaged — for advanced use)
// ---------------------------------------------------------------------------

/** Props for the standalone `<Toast>` element (used directly, not via context) */
export interface ToastProps extends ToastItem {
  isExiting?: boolean;
  onDismiss?: () => void;
}

export function Toast({ isExiting = false, onDismiss, ...item }: ToastProps) {
  return (
    <ToastCard item={item} isExiting={isExiting} onDismiss={onDismiss ?? (() => {})} />
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns `{ toast, dismiss }` from the nearest `<ToastProvider>`.
 * Must be used inside a `<ToastProvider>` subtree.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside a <ToastProvider>');
  }
  return ctx;
}

export default Toast;
