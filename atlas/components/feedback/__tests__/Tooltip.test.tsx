import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { Tooltip } from '../Tooltip';

afterEach(() => {
  vi.useRealTimers();
});

describe('Tooltip', () => {
  it('renders the trigger child immediately + hides the tooltip', () => {
    render(
      <Tooltip content="Hint">
        <button>Trigger</button>
      </Tooltip>
    );
    expect(screen.getByRole('button', { name: 'Trigger' })).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows the tooltip after hover + delay; hides on mouseleave', () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Hint" delay={100}>
        <button>T</button>
      </Tooltip>
    );
    const btn = screen.getByRole('button', { name: 'T' });
    fireEvent.mouseEnter(btn);
    // Tooltip not yet visible — still in delay
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Hint');
    fireEvent.mouseLeave(btn);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('applies side modifier class to the tooltip', () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Hi" side="right" delay={0}>
        <button>X</button>
      </Tooltip>
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'X' }));
    act(() => {
      vi.advanceTimersByTime(20);
    });
    const tip = screen.getByRole('tooltip');
    expect(tip.className).toContain('ja-tooltip--right');
  });
});
