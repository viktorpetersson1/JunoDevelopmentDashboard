import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sparkline } from '../Sparkline';

describe('Sparkline', () => {
  it('renders an SVG with role=img + polyline for ≥2 data points', () => {
    const { container } = render(<Sparkline data={[10, 14, 11, 18, 22]} />);
    const svg = screen.getByRole('img', { name: 'Sparkline chart' });
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(container.querySelector('polyline')).not.toBeNull();
  });

  it('returns null for empty or single-point data', () => {
    const { container: empty } = render(<Sparkline data={[]} />);
    expect(empty.querySelector('svg')).toBeNull();

    const { container: single } = render(<Sparkline data={[42]} />);
    expect(single.querySelector('svg')).toBeNull();
  });

  it('renders gradient + polygon when fill=true', () => {
    const { container } = render(<Sparkline data={[1, 2, 3]} variant="positive" fill />);
    expect(container.querySelector('linearGradient')).not.toBeNull();
    expect(container.querySelector('polygon')).not.toBeNull();
  });

  it('uses CSS var stroke color (no raw hex per CLAUDE.md §9.3)', () => {
    const { container } = render(<Sparkline data={[1, 2, 3]} variant="negative" />);
    const line = container.querySelector('polyline');
    expect(line?.getAttribute('stroke')).toBe('var(--color-negative)');
  });
});
