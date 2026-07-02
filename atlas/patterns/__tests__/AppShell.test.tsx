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

  it('renders default sidebar sections (7 primary + 2 account, no section labels)', () => {
    // T098 — nav collapsed from 15 items / 3 labelled sections to 6+2 / no labels.
    // AJ-8 (Ask Juno v2): + "Ask Juno" under Home → 7 primary.
    render(
      <AppShell activeHref="/dashboard" scenario="base" onScenarioChange={() => {}}>
        x
      </AppShell>
    );
    // No section labels in the simplified nav.
    expect(screen.queryByText('PORTFOLIO')).not.toBeInTheDocument();
    expect(screen.queryByText('WORKSPACE')).not.toBeInTheDocument();
    // Primary items present (incl. the new Ask Juno entry, AJ-8).
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Ask Juno' })).toHaveAttribute('href', '/agent');
    expect(screen.getByRole('link', { name: 'Finance & Analytics' })).toHaveAttribute(
      'href',
      '/analytics'
    ); // T114 (V6.1)
    expect(screen.getByRole('link', { name: 'Earnings' })).toHaveAttribute('href', '/earnings');
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
    // 2 sections (7 primary incl. Ask Juno [AJ-8] + 2 account), no labels.
    expect(DEFAULT_SIDEBAR_SECTIONS).toHaveLength(2);
    expect(DEFAULT_SIDEBAR_SECTIONS[0]?.items).toHaveLength(7);
    expect(DEFAULT_SIDEBAR_SECTIONS[1]?.items).toHaveLength(2);
    expect(DEFAULT_USER.name).toBe('Viktor Petersson');
  });
});
