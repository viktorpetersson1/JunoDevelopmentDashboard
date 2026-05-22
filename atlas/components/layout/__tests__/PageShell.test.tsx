import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageShell } from '../PageShell';

describe('PageShell', () => {
  it('renders sidebar + topbar + main content slots', () => {
    render(
      <PageShell
        sidebar={<aside data-testid="sb">SIDEBAR</aside>}
        topbar={<header data-testid="tb">TOPBAR</header>}
      >
        <p>BODY</p>
      </PageShell>
    );
    expect(screen.getByTestId('sb')).toHaveTextContent('SIDEBAR');
    expect(screen.getByTestId('tb')).toHaveTextContent('TOPBAR');
    expect(screen.getByRole('main', { name: 'Page content' })).toHaveTextContent('BODY');
  });

  it('content area has id="main-content" for skip-link target', () => {
    const { container } = render(
      <PageShell sidebar={<span />} topbar={<span />}>
        body
      </PageShell>
    );
    const main = container.querySelector('#main-content') as HTMLElement;
    expect(main).not.toBeNull();
    expect(main.tagName).toBe('MAIN');
  });

  it('accepts custom className on the root', () => {
    const { container } = render(
      <PageShell sidebar={<span />} topbar={<span />} className="custom-shell">
        x
      </PageShell>
    );
    const root = container.querySelector('.ja-page-shell') as HTMLElement;
    expect(root.className).toContain('custom-shell');
  });
});
