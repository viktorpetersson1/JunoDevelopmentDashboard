/**
 * Tooltip — Juno Atlas feedback layer
 *
 * Hover/focus-triggered hint bubble rendered via portal. Dark background,
 * white text, 4px radius, small directional arrow. Uses `aria-describedby`
 * to connect the trigger to the tooltip for accessibility.
 *
 * @example
 * ```tsx
 * import { Tooltip } from '@juno-atlas/components/feedback';
 *
 * <Tooltip content="Opens the project wizard" side="top">
 *   <button>New project</button>
 * </Tooltip>
 *
 * // Right-side, longer delay:
 * <Tooltip content="Calculated from unlevered cash flows" side="right" delay={400}>
 *   <span>IRR</span>
 * </Tooltip>
 * ```
 */

import React, {
  forwardRef,
  useCallback,
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

export type TooltipSide = 'top' | 'right' | 'bottom' | 'left';

export interface TooltipProps {
  /** Tooltip text or JSX content */
  content: ReactNode;
  /** Preferred side relative to the trigger (default: 'top') */
  side?: TooltipSide;
  /** Hover/focus delay in ms before showing (default: 200) */
  delay?: number;
  /** The trigger element — must accept ref forwarding */
  children: ReactNode;
  /** Additional className for the bubble */
  className?: string;
}

// ---------------------------------------------------------------------------
// Position calculation
// ---------------------------------------------------------------------------

const OFFSET = 8; // px gap between trigger and bubble
const ARROW = 5;  // arrow half-height (matches CSS border: 5px)

interface Position {
  top: number;
  left: number;
}

function calculatePosition(
  trigger: DOMRect,
  tooltip: DOMRect,
  side: TooltipSide,
): Position {
  switch (side) {
    case 'top':
      return {
        top: trigger.top - tooltip.height - OFFSET - ARROW,
        left: trigger.left + trigger.width / 2 - tooltip.width / 2,
      };
    case 'bottom':
      return {
        top: trigger.bottom + OFFSET + ARROW,
        left: trigger.left + trigger.width / 2 - tooltip.width / 2,
      };
    case 'right':
      return {
        top: trigger.top + trigger.height / 2 - tooltip.height / 2,
        left: trigger.right + OFFSET + ARROW,
      };
    case 'left':
      return {
        top: trigger.top + trigger.height / 2 - tooltip.height / 2,
        left: trigger.left - tooltip.width - OFFSET - ARROW,
      };
  }
}

/** Clamp tooltip within viewport with 8px margin */
function clampPosition(pos: Position, tooltip: DOMRect): Position {
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    top: Math.max(margin, Math.min(pos.top, vh - tooltip.height - margin)),
    left: Math.max(margin, Math.min(pos.left, vw - tooltip.width - margin)),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Tooltip = forwardRef<HTMLElement, TooltipProps>(
  ({ content, side = 'top', delay = 200, children, className }, _ref) => {
    const tooltipId = useId();
    const triggerRef = useRef<HTMLElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [visible, setVisible] = useState(false);
    const [position, setPosition] = useState<Position>({ top: 0, left: 0 });

    const updatePosition = useCallback(() => {
      if (!triggerRef.current || !tooltipRef.current) return;
      const trigRect = triggerRef.current.getBoundingClientRect();
      const tipRect = tooltipRef.current.getBoundingClientRect();
      const raw = calculatePosition(trigRect, tipRect, side);
      setPosition(clampPosition(raw, tipRect));
    }, [side]);

    const show = useCallback(() => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setVisible(true);
        // Position on next frame after render
        requestAnimationFrame(() => updatePosition());
      }, delay);
    }, [delay, updatePosition]);

    const hide = useCallback(() => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setVisible(false);
    }, []);

    // Clone the child to inject trigger props.
    // `ref` is not part of HTMLAttributes — we cast the injected prop bag
    // through a permissive type since React.cloneElement accepts any props
    // shape compatible with the cloned element.
    type TriggerProps = React.HTMLAttributes<HTMLElement> & {
      ref?: React.Ref<HTMLElement>;
    };

    const trigger = React.isValidElement(children)
      ? React.cloneElement(
          children as React.ReactElement<React.HTMLAttributes<HTMLElement>>,
          {
            ref: (node: HTMLElement | null) => {
              (triggerRef as React.MutableRefObject<HTMLElement | null>).current = node;
              // Forward original ref if any
              const childRef = (children as React.ReactElement & { ref?: React.Ref<unknown> }).ref;
              if (typeof childRef === 'function') childRef(node);
              else if (childRef && typeof childRef === 'object') {
                (childRef as React.MutableRefObject<HTMLElement | null>).current = node;
              }
            },
            onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
              show();
              (children as React.ReactElement<React.HTMLAttributes<HTMLElement>>).props.onMouseEnter?.(e);
            },
            onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
              hide();
              (children as React.ReactElement<React.HTMLAttributes<HTMLElement>>).props.onMouseLeave?.(e);
            },
            onFocus: (e: React.FocusEvent<HTMLElement>) => {
              show();
              (children as React.ReactElement<React.HTMLAttributes<HTMLElement>>).props.onFocus?.(e);
            },
            onBlur: (e: React.FocusEvent<HTMLElement>) => {
              hide();
              (children as React.ReactElement<React.HTMLAttributes<HTMLElement>>).props.onBlur?.(e);
            },
            'aria-describedby': visible ? tooltipId : undefined,
          } as TriggerProps
        )
      : children;

    return (
      <>
        {trigger}
        {visible &&
          createPortal(
            <div
              id={tooltipId}
              ref={tooltipRef}
              role="tooltip"
              className={[
                'ja-tooltip',
                `ja-tooltip--${side}`,
                className,
              ]
                .filter(Boolean)
                .join(' ')}
              style={{
                top: position.top,
                left: position.left,
              }}
            >
              {content}
            </div>,
            document.body,
          )}
      </>
    );
  },
);

Tooltip.displayName = 'Tooltip';
export default Tooltip;
