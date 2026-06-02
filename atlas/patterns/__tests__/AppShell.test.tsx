import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppShell, DEFAULT_SIDEBAR_SECTIONS, DEFAULT_USER } from '../AppShell';

describe('AppShell', () => {
  it('renders sidebar + topbar + main content with default nav', () => {
    render(
      <AppShell activeHref="/" scenario="base" onScenarioChange={() => {}}>
        <p>BODY</p>
      </AppShell>
    );
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.getByRole('banner', { name: 'Page topbar' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Page content' })).toHaveTextContent('BODY');
  });

  it('renders default sidebar sections (T098: 6 primary + 2 account, no section labels)', () => {
    // T098 — nav collapsed from 15 items / 3 labelled sections to 6+2 / no labels.
    render(
      <AppShell activeHref="/dashboard" scenario="base" onScenarioChange={() => {}}>
        x
      </AppShell>
    );
    // No section labels in the simplified nav.
    expect(screen.queryByText('PORTFOLIO')).not.toBeInTheDocument();
    expect(screen.queryByText('WORKSPACE')).not.toBeInTheDocument();
    // Primary 6 items present.
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute('href', '/analytics');
    expect(screen.getByRole('link', { name: 'Earnings' })).toHaveAttribute('href', '/earnings');
    // Active link (Home = /dashboard).
    const home = screen.getByRole('link', { name: 'Home' });
    expect(home).toHaveAttribute('aria-current', 'page');
  });

  it('user prop overrides DEFAULT_USER; topbar actions slot renders', () => {
    render(
      <AppShell
        activeHref="/"
        scenario="base"
        onScenarioChange={() => {}}
        user={{ name: 'Alex Chen', email: 'alex@juno.com' }}
        topbarActions={<button>Save</button>}
      >
        x
      </AppShell>
    );
    expect(screen.getByText('Alex Chen')).toBeInTheDocument();
    expect(screen.getByText('alex@juno.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('exports DEFAULT_SIDEBAR_SECTIONS + DEFAULT_USER constants', () => {
    // T098: 2 sections (6 primary + 2 account), no labels.
    expect(DEFAULT_SIDEBAR_SECTIONS).toHaveLength(2);
    expect(DEFAULT_SIDEBAR_SECTIONS[0]?.items).toHaveLength(6);
    expect(DEFAULT_SIDEBAR_SECTIONS[1]?.items).toHaveLength(2);
    expect(DEFAULT_USER.name).toBe('Viktor Petersson');
  });
});
