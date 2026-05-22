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

  it('renders badge + user footer with name and email', () => {
    render(<Sidebar sections={SECTIONS} user={USER} activeHref="/" />);
    expect(screen.getByLabelText('7 items')).toHaveTextContent('7');
    expect(screen.getByText('Viktor Petersson')).toBeInTheDocument();
    expect(screen.getByText('viktor@juno.com')).toBeInTheDocument();
  });
});
