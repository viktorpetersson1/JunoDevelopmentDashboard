import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { JunoMark } from '../JunoMark';

describe('JunoMark', () => {
  it('renders as decorative SVG by default', () => {
    const { container } = render(<JunoMark />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('role')).toBeNull();
  });

  it('exposes role=img + aria-label when ariaLabel is provided', () => {
    const { container } = render(<JunoMark ariaLabel="Juno" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Juno');
  });

  it('contains the circle + vertical chord geometry', () => {
    const { container } = render(<JunoMark />);
    expect(container.querySelector('circle')).not.toBeNull();
    const line = container.querySelector('line');
    expect(line).not.toBeNull();
    // Vertical chord: same x at top and bottom
    expect(line?.getAttribute('x1')).toBe(line?.getAttribute('x2'));
  });

  it('toggles the animated class when animated prop is set', () => {
    const { container, rerender } = render(<JunoMark />);
    expect(container.querySelector('.juno-mark--animated')).toBeNull();

    rerender(<JunoMark animated />);
    expect(container.querySelector('.juno-mark--animated')).not.toBeNull();
  });

  it('respects size prop', () => {
    const { container } = render(<JunoMark size={48} />);
    const wrapper = container.querySelector('.juno-mark') as HTMLElement;
    expect(wrapper.style.width).toBe('48px');
    expect(wrapper.style.height).toBe('48px');
  });
});
