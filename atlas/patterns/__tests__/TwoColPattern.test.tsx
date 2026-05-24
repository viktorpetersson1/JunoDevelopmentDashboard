import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TwoColPattern } from '../TwoColPattern';

describe('TwoColPattern', () => {
  it('renders main + rail slots', () => {
    render(<TwoColPattern main={<p>MAIN</p>} rail={<p>RAIL</p>} />);
    expect(screen.getByText('MAIN')).toBeInTheDocument();
    expect(screen.getByText('RAIL')).toBeInTheDocument();
  });

  it('applies default gap (24px) + custom stackBelow as data attr', () => {
    const { container } = render(
      <TwoColPattern main={<span />} rail={<span />} stackBelow={768} />
    );
    const root = container.querySelector('.ja-two-col') as HTMLElement;
    expect(root.style.getPropertyValue('--ja-twocol-gap')).toBe('24px');
    expect(root.getAttribute('data-stack-below')).toBe('768');
  });

  it('numeric gap converts to px; aria-label forwarded', () => {
    const { container } = render(
      <TwoColPattern main={<span />} rail={<span />} gap={16} aria-label="Body" />
    );
    const root = container.querySelector('.ja-two-col') as HTMLElement;
    expect(root.style.getPropertyValue('--ja-twocol-gap')).toBe('16px');
    expect(root.getAttribute('aria-label')).toBe('Body');
  });
});
