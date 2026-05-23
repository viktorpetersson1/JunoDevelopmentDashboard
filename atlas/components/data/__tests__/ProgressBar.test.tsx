import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from '../ProgressBar';

describe('ProgressBar', () => {
  it('renders progressbar role with value attrs', () => {
    render(<ProgressBar value={42} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('clamps value to [0, max] for the fill width', () => {
    const { container } = render(<ProgressBar value={150} max={100} />);
    const fill = container.querySelector('.ja-progress__fill') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('applies variant + size modifiers, header + percent when showValue', () => {
    const { container } = render(
      <ProgressBar value={40} max={200} variant="warning" size="sm" label="Used" showValue />
    );
    expect(screen.getByText('Used')).toBeInTheDocument();
    // 40 / 200 = 20%
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(container.querySelector('.ja-progress__fill--warning')).toBeInTheDocument();
    expect(container.querySelector('.ja-progress__track--sm')).toBeInTheDocument();
  });
});
