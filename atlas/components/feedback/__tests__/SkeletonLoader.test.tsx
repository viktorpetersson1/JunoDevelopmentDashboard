import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkeletonLoader } from '../SkeletonLoader';

describe('SkeletonLoader', () => {
  it('renders status with aria-busy for single text variant', () => {
    const { container } = render(<SkeletonLoader variant="text" />);
    expect(screen.getByRole('status', { name: 'Loading…' })).toBeInTheDocument();
    expect(container.querySelector('.ja-skeleton--text')).toBeInTheDocument();
  });

  it('stacks N skeletons when count > 1', () => {
    const { container } = render(<SkeletonLoader variant="row" count={5} />);
    expect(container.querySelector('.ja-skeleton-group')).toBeInTheDocument();
    expect(container.querySelectorAll('.ja-skeleton--row')).toHaveLength(5);
  });

  it('applies variant-specific class for circle + kpi', () => {
    const { container: c1 } = render(<SkeletonLoader variant="circle" />);
    expect(c1.querySelector('.ja-skeleton--circle')).toBeInTheDocument();
    const { container: c2 } = render(<SkeletonLoader variant="kpi" />);
    expect(c2.querySelector('.ja-skeleton--kpi')).toBeInTheDocument();
  });
});
