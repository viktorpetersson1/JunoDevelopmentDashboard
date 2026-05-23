import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Status } from '../Status';

describe('Status', () => {
  it('renders label + accessible aria-label combining state + label', () => {
    render(<Status state="positive" label="On Track" />);
    const el = screen.getByLabelText('Positive: On Track');
    expect(el).toBeInTheDocument();
    expect(screen.getByText('On Track')).toBeInTheDocument();
  });

  it('applies state-specific dot class for each variant', () => {
    const { container, rerender } = render(<Status state="warning" label="x" />);
    expect(container.querySelector('.ja-status__dot--warning')).toBeInTheDocument();

    rerender(<Status state="negative" label="x" />);
    expect(container.querySelector('.ja-status__dot--negative')).toBeInTheDocument();

    rerender(<Status state="info" label="x" />);
    expect(container.querySelector('.ja-status__dot--info')).toBeInTheDocument();
  });

  it('dot is aria-hidden (decorative; label carries semantics)', () => {
    const { container } = render(<Status state="neutral" label="Planning" />);
    const dot = container.querySelector('.ja-status__dot');
    expect(dot).toHaveAttribute('aria-hidden', 'true');
  });
});
