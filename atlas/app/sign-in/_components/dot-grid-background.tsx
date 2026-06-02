'use client';

/**
 * T103.11 — Juno sign-in dot-grid signature.
 *
 * A subtle grey dot grid on a white background (Render.com-style). Each dot
 * within ~140px of the cursor is pulled toward it on a falloff curve — like a
 * magnetic gravity well — so the grid LITERALLY moves with you, not just
 * grows. Smaller dots than the original sand version so the effect reads
 * delicate rather than dramatic. Vanilla JS + Canvas 2D, no library.
 *
 * Constraints (V5.2 §T103.11):
 *   - prefers-reduced-motion: render once, no animation, no pointer listeners
 *   - aria-hidden + pointer-events:none — pure decoration, never blocks the form
 *   - animate only while the pointer is inside the viewport
 *   - hi-DPI safe via devicePixelRatio
 */

import { useEffect, useRef } from 'react';

interface DotGridProps {
  /** Dot grid spacing in px. */
  spacing?: number;
  /** Dot base radius in px. */
  baseRadius?: number;
  /** Peak radius on cursor hover in px (slight grow as it's also pulled). */
  peakRadius?: number;
  /** Influence radius around the cursor in px. */
  influence?: number;
  /** Maximum displacement amount (px) for a dot directly under the cursor. */
  pullStrength?: number;
  /** Fixed dot color (no CSS variable lookup — keeps cold start instant). */
  baseColor?: string;
  /** Color of the dot directly under the cursor. */
  peakColor?: string;
}

export function DotGridBackground({
  // Tuned per Viktor 2 Jun visual feedback to match render.com:
  // - tighter spacing so the field reads as a texture, not individual dots
  // - lighter base so it's almost invisible at rest
  // - peak color is medium-grey (NOT near-black) so even a focused dot
  //   doesn't punch through; the magnetic displacement carries the effect
  // - gentler pull so it feels "lit by gravity" rather than dragged
  spacing = 16,
  baseRadius = 0.9,
  peakRadius = 1.8,
  influence = 120,
  pullStrength = 9,
  baseColor = '#e8e8e6',
  peakColor = '#9a9a96',
}: DotGridProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const context = canvasEl.getContext('2d');
    if (!context) return;
    // Rebind to non-null-typed locals so the nested draw/resize closures don't
    // need null-narrowing (TS doesn't flow the guards into inner functions).
    const cv: HTMLCanvasElement = canvasEl;
    const cx: CanvasRenderingContext2D = context;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Colors are passed as props — no CSS var lookup so the first frame paints
    // with the right values even before the stylesheet finishes hydrating.

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.floor(window.innerWidth * dpr);
      cv.height = Math.floor(window.innerHeight * dpr);
      cv.style.width = `${window.innerWidth}px`;
      cv.style.height = `${window.innerHeight}px`;
      // setTransform (not scale) so repeated resizes don't compound the DPR.
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      cx.clearRect(0, 0, w, h);
      const p = pointerRef.current;
      const inv = 1 / influence;
      for (let x = spacing; x < w; x += spacing) {
        for (let y = spacing; y < h; y += spacing) {
          let drawX = x;
          let drawY = y;
          let r = baseRadius;
          let color = baseColor;
          if (p && !reduce) {
            const dx = p.x - x;
            const dy = p.y - y;
            const distSq = dx * dx + dy * dy;
            const infSq = influence * influence;
            if (distSq < infSq) {
              const dist = Math.sqrt(distSq);
              // Falloff: cubic so the gravity well feels soft at the edges.
              const tLin = 1 - dist * inv;
              const t = tLin * tLin * tLin + tLin * 0.4; // bias + ease
              const pull = pullStrength * t;
              // Magnetic pull toward the cursor (unit vector × strength).
              if (dist > 0.01) {
                drawX = x + (dx / dist) * pull;
                drawY = y + (dy / dist) * pull;
              }
              r = baseRadius + (peakRadius - baseRadius) * tLin;
              // Smooth color lerp from base to peak.
              color = lerpColor(Math.min(1, tLin * 1.4));
            }
          }
          cx.beginPath();
          cx.arc(drawX, drawY, r, 0, Math.PI * 2);
          cx.fillStyle = color;
          cx.fill();
        }
      }
    }

    function hex(v: string): { r: number; g: number; b: number } {
      const m = v.replace('#', '');
      const full =
        m.length === 3
          ? m
              .split('')
              .map((c) => c + c)
              .join('')
          : m;
      return {
        r: parseInt(full.slice(0, 2), 16),
        g: parseInt(full.slice(2, 4), 16),
        b: parseInt(full.slice(4, 6), 16),
      };
    }
    const baseRgb = hex(baseColor);
    const peakRgb = hex(peakColor);
    function lerpColor(t: number): string {
      const r = Math.round(baseRgb.r + (peakRgb.r - baseRgb.r) * t);
      const g = Math.round(baseRgb.g + (peakRgb.g - baseRgb.g) * t);
      const b = Math.round(baseRgb.b + (peakRgb.b - baseRgb.b) * t);
      return `rgb(${r},${g},${b})`;
    }

    function loop() {
      draw();
      rafRef.current = requestAnimationFrame(loop);
    }

    function onMove(e: PointerEvent) {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    }
    function onLeave() {
      pointerRef.current = null;
    }

    resize();
    window.addEventListener('resize', resize);
    if (reduce) {
      draw(); // single static render, no animation
    } else {
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerleave', onLeave);
      loop();
    }

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
    };
  }, [spacing, baseRadius, peakRadius, influence, pullStrength, baseColor, peakColor]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}
    />
  );
}
