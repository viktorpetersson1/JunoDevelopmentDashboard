import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TabbedPage } from '../TabbedPage';

const TABS = [
  { href: '/summary', label: 'Summary', active: true },
  { href: '/risks', label: 'Risks', active: false, count: 4 },
];

describe('TabbedPage', () => {
  it('renders title + subtitle + active tab content', () => {
    render(
      <TabbedPage title="Project 84 SBR" subtitle="Sag Harbor" tabs={TABS}>
        <p>BODY</p>
      </TabbedPage>
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Project 84 SBR' })).toBeInTheDocument();
    expect(screen.getByText('Sag Harbor')).toBeInTheDocument();
    expect(screen.getByText('BODY')).toBeInTheDocument();
  });

  it('renders all tabs in a tablist + active aria-current', () => {
    render(<TabbedPage title="x" tabs={TABS} />);
    const tablist = screen.getByRole('tablist', { name: 'Page sections' });
    expect(tablist).toBeInTheDocument();
    const summaryTab = screen.getByRole('link', { name: 'Summary' });
    expect(summaryTab).toHaveAttribute('aria-current', 'page');
  });

  it('renders count badge + actions slot', () => {
    render(<TabbedPage title="x" tabs={TABS} actions={<button>Edit</button>} />);
    expect(screen.getByLabelText('4 items')).toHaveTextContent('4');
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });
});
