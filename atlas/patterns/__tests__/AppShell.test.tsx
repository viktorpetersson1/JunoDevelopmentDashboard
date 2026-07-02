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

  it('renders the V7 four-surface nav (Home · Projects · Pipeline · Ask Juno)', () => {
    // V7 T134 — The Simplification: exactly 4 items, one section, no labels.
    // Settings lives in the topbar user menu; everything else is parked.
    render(
      <AppShell activeHref="/dashboard" scenario="base" onScenarioChange={() => {}}>
        x
      </AppShell>
    );
    expect(screen.queryByText('PORTFOLIO')).not.toBeInTheDocument();
    expect(screen.queryByText('WORKSPACE')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects');
    expect(screen.getByRole('link', { name: 'Pipeline' })).toHaveAttribute('href', '/pipeline');
    expect(screen.getByRole('link', { name: 'Ask Juno' })).toHaveAttribute('href', '/agent');
    // Parked surfaces are NOT in the nav.
    for (const gone of [
      'Pricing',
      'Finance & Analytics',
      'Earnings',
      'Notifications',
      'Settings',
    ]) {
      expect(screen.queryByRole('link', { name: gone })).not.toBeInTheDocument();
    }
    // Active link (Home = /dashboard).
    const home = screen.getByRole('link', { name: 'Home' });
    expect(home).toHaveAttribute('aria-current', 'page');
  });

  it('user prop is wired through Sidebar; topbar actions slot renders', () => {
    // V5.2: the sidebar footer chip is opt-in (showFooter, default false) and
    // the user identity now lives in the topbar via DashboardShell's UserMenu.
    // AppShell itself no longer surfaces user name/email by default — but the
    // SidebarUser prop still threads through (asserted via the `name` aria-label).
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
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    // Sidebar still exists; the footer chip is just hidden by default.
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

  it('exports DEFAULT_SIDEBAR_SECTIONS + DEFAULT_USER constants', () => {
    // V7 T134: ONE section, exactly 4 surfaces.
    expect(DEFAULT_SIDEBAR_SECTIONS).toHaveLength(1);
    expect(DEFAULT_SIDEBAR_SECTIONS[0]?.items).toHaveLength(4);
    expect(DEFAULT_SIDEBAR_SECTIONS[0]?.items.map((i) => i.href)).toEqual([
      '/dashboard',
      '/projects',
      '/pipeline',
      '/agent',
    ]);
    expect(DEFAULT_USER.name).toBe('Viktor Petersson');
  });
});
