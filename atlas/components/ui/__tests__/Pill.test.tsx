import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Pill } from '../Pill';

describe('Pill', () => {
  it('renders default muted variant', () => {
    render(<Pill>Draft</Pill>);
    const pill = screen.getByText('Draft');
    expect(pill.className).toContain('ja-pill');
    expect(pill.className).toContain('ja-pill--muted');
  });

  it('applies positive + negative + warning + info variants', () => {
    const { rerender } = render(<Pill variant="positive">A</Pill>);
    expect(screen.getByText('A').className).toContain('ja-pill--positive');

    rerender(<Pill variant="negative">B</Pill>);
    expect(screen.getByText('B').className).toContain('ja-pill--negative');

    rerender(<Pill variant="warning">C</Pill>);
    expect(screen.getByText('C').className).toContain('ja-pill--warning');

    rerender(<Pill variant="info">D</Pill>);
    expect(screen.getByText('D').className).toContain('ja-pill--info');
  });

  it('renders status dot when dot prop is set', () => {
    const { container } = render(
      <Pill variant="positive" dot>
        On track
      </Pill>
    );
    expect(container.querySelector('.ja-pill__dot')).toBeInTheDocument();
  });
});
