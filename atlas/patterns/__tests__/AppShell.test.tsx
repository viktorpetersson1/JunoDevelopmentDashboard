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

  it('renders default sidebar sections (Portfolio + Workspace + Account)', () => {
    render(
      <AppShell activeHref="/" scenario="base" onScenarioChange={() => {}}>
        x
      </AppShell>
    );
    // 3 section labels in the default sidebar
    expect(screen.getByText('PORTFOLIO')).toBeInTheDocument();
    expect(screen.getByText('WORKSPACE')).toBeInTheDocument();
    expect(screen.getByText('ACCOUNT')).toBeInTheDocument();
    // Active link
    const overview = screen.getByRole('link', { name: 'Overview' });
    expect(overview).toHaveAttribute('aria-current', 'page');
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
    expect(DEFAULT_SIDEBAR_SECTIONS).toHaveLength(3);
    expect(DEFAULT_USER.name).toBe('Viktor Petersson');
  });
});
