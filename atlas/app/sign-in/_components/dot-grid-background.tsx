'use client';

/**
 * T103.11 — Juno sign-in dot-grid signature.
 *
 * A subtle sand-toned dot grid behind the sign-in card. Dots within ~120px of
 * the cursor grow + brighten, creating a soft interactive ripple — the first
 * thing every owner sees on every visit. Vanilla JS + Canvas 2D, no library
 * (Hard Rule #3).
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
  /** Peak radius on cursor hover in px. */
  peakRadius?: number;
  /** Influence radius around the cursor in px. */
  influence?: number;
  /** CSS variable for the base dot color. */
  baseColorVar?: string;
  /** CSS variable for the peak (hover) dot color. */
  peakColorVar?: string;
}

export function DotGridBackground({
  spacing = 16,
  baseRadius = 1.5,
  peakRadius = 3.5,
  influence = 120,
  baseColorVar = '--color-brand-sand-soft',
  peakColorVar = '--color-brand-sand-strong',
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
    const styles = getComputedStyle(document.documentElement);
    const baseColor = styles.getPropertyValue(baseColorVar).trim() || '#f2ecdc';
    const peakColor = styles.getPropertyValue(peakColorVar).trim() || '#d4c7ad';

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
      for (let x = spacing; x < w; x += spacing) {
        for (let y = spacing; y < h; y += spacing) {
          let r = baseRadius;
          let color = baseColor;
          if (p && !reduce) {
            const dx = p.x - x;
            const dy = p.y - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < influence) {
              const t = 1 - dist / influence; // 0..1
              r = baseRadius + (peakRadius - baseRadius) * t;
              color = t > 0.5 ? peakColor : baseColor;
            }
          }
          cx.beginPath();
          cx.arc(x, y, r, 0, Math.PI * 2);
          cx.fillStyle = color;
          cx.fill();
        }
      }
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
  }, [spacing, baseRadius, peakRadius, influence, baseColorVar, peakColorVar]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}
    />
  );
}
