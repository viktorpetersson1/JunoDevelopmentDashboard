import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('renders status role with title + description', () => {
    render(<EmptyState title="No projects yet" description="Create one" />);
    expect(screen.getByRole('status', { name: 'No projects yet' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'No projects yet' })).toBeInTheDocument();
    expect(screen.getByText('Create one')).toBeInTheDocument();
  });

  it('renders icon slot when provided', () => {
    const { container } = render(
      <EmptyState title="x" icon={<svg data-testid="ico" />} />
    );
    expect(screen.getByTestId('ico')).toBeInTheDocument();
    expect(container.querySelector('.ja-empty-state__icon')).toBeInTheDocument();
  });

  it('renders + fires CTA action when provided', () => {
    const handle = vi.fn();
    render(
      <EmptyState
        title="No projects"
        action={{ label: 'New project', onClick: handle }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    expect(handle).toHaveBeenCalledTimes(1);
  });
});
