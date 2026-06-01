import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { JunoThinking } from '../JunoThinking';

describe('JunoThinking', () => {
  it('renders with role=status for SR announcement', () => {
    const { container } = render(<JunoThinking />);
    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status?.getAttribute('aria-live')).toBe('polite');
  });

  it('uses default aria-label when no label passed', () => {
    const { container } = render(<JunoThinking />);
    const status = container.querySelector('[role="status"]');
    expect(status?.getAttribute('aria-label')).toBe('Juno is thinking');
  });

  it('uses provided label as aria-label + visible text', () => {
    const { container, getByText } = render(<JunoThinking label="Running calc" />);
    const status = container.querySelector('[role="status"]');
    expect(status?.getAttribute('aria-label')).toBe('Running calc');
    expect(getByText('Running calc')).toBeTruthy();
  });

  it('hides label visually when visuallyHiddenLabel is true', () => {
    const { container } = render(<JunoThinking label="Loading projects" visuallyHiddenLabel />);
    // Visible label span is absent; visually-hidden span is present
    const visibleSpans = Array.from(container.querySelectorAll('span'));
    const hasInlineHidden = visibleSpans.some(
      (s) => s.textContent === 'Loading projects' && s.style.position === 'absolute'
    );
    expect(hasInlineHidden).toBe(true);
  });

  it('renders an animated JunoMark inside', () => {
    const { container } = render(<JunoThinking />);
    expect(container.querySelector('.juno-mark--animated')).not.toBeNull();
  });
});
