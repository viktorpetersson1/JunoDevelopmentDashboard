import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Breadcrumb } from '../Breadcrumb';

describe('Breadcrumb', () => {
  it('renders nothing when items is empty', () => {
    const { container } = render(<Breadcrumb items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders intermediate items as links and last item as current page', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'Projects', href: '/projects' },
          { label: 'Horizon', href: '/projects/horizon' },
          { label: 'Capital' },
        ]}
      />
    );
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    const projectsLink = screen.getByRole('link', { name: 'Projects' });
    expect(projectsLink).toHaveAttribute('href', '/projects');
    const current = screen.getByText('Capital');
    expect(current).toHaveAttribute('aria-current', 'page');
  });

  it('renders intermediate item without href as a span with role=button', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'Root' }, // no href, but not last
          { label: 'Leaf' },
        ]}
      />
    );
    const rootSpan = screen.getByText('Root');
    expect(rootSpan.tagName).toBe('SPAN');
    expect(rootSpan).toHaveAttribute('role', 'button');
  });
});
