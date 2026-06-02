import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from '../Sidebar';

const SECTIONS = [
  {
    label: 'Portfolio',
    items: [
      { href: '/', label: 'Overview' },
      { href: '/projects', label: 'Projects', badge: 7 },
    ],
  },
];

const USER = { name: 'Viktor Petersson', email: 'viktor@juno.com' };

describe('Sidebar', () => {
  it('renders navigation landmark with section label + items', () => {
    render(<Sidebar sections={SECTIONS} user={USER} activeHref="/" />);
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.getByText('Portfolio')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Projects/ })).toBeInTheDocument();
  });

  it('marks active link with aria-current=page', () => {
    render(<Sidebar sections={SECTIONS} user={USER} activeHref="/projects" />);
    const projectsLink = screen.getByRole('link', { name: /Projects/ });
    expect(projectsLink).toHaveAttribute('aria-current', 'page');
    const overviewLink = screen.getByRole('link', { name: 'Overview' });
    expect(overviewLink).not.toHaveAttribute('aria-current');
  });

  it('renders badge; user footer is opt-in via showFooter (V5.2)', () => {
    // Default: no footer chip (the user menu moved to the topbar — V5.2 Viktor feedback).
    const { unmount } = render(<Sidebar sections={SECTIONS} user={USER} activeHref="/" />);
    expect(screen.getByLabelText('7 items')).toHaveTextContent('7');
    expect(screen.queryByText('Viktor Petersson')).not.toBeInTheDocument();
    expect(screen.queryByText('viktor@juno.com')).not.toBeInTheDocument();
    unmount();

    // Opt-in: showFooter=true still renders the chip (storybook / standalone usage).
    render(<Sidebar sections={SECTIONS} user={USER} activeHref="/" showFooter />);
    expect(screen.getByText('Viktor Petersson')).toBeInTheDocument();
    expect(screen.getByText('viktor@juno.com')).toBeInTheDocument();
  });
});
