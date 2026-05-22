import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Section } from '../Section';

describe('Section', () => {
  it('renders title as h2 + body when children provided', () => {
    render(
      <Section title="Cash flow" subtitle="12-month projection">
        <p>chart</p>
      </Section>
    );
    const heading = screen.getByRole('heading', { level: 2, name: 'Cash flow' });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText('12-month projection')).toBeInTheDocument();
    expect(screen.getByText('chart')).toBeInTheDocument();
  });

  it('respects custom heading level + id', () => {
    render(<Section title="Risks" headingLevel="h3" id="risks" />);
    const heading = screen.getByRole('heading', { level: 3, name: 'Risks' });
    expect(heading.id).toBe('risks-title');
  });

  it('renders actions slot + applies bordered modifier toggle', () => {
    const { container, rerender } = render(
      <Section title="A" actions={<button>Export</button>}>
        body
      </Section>
    );
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(container.querySelector('.ja-section--bordered')).toBeInTheDocument();

    rerender(
      <Section title="A" bordered={false}>
        body
      </Section>
    );
    expect(container.querySelector('.ja-section--bordered')).not.toBeInTheDocument();
  });
});
