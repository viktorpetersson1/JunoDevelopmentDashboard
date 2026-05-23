import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KPITile } from '../KPITile';

describe('KPITile', () => {
  it('renders label + value', () => {
    render(<KPITile label="Revenue" value="$2.4M" />);
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('$2.4M')).toBeInTheDocument();
  });

  it('renders delta badge with arrow + direction class', () => {
    const { container } = render(
      <KPITile label="GM" value="23.4%" delta={{ value: '+12%', direction: 'up' }} />
    );
    expect(screen.getByText('+12%')).toBeInTheDocument();
    expect(container.querySelector('.ja-kpi-tile__delta--up')).toBeInTheDocument();
  });

  it('renders hint + sparkline slot when provided', () => {
    const { container } = render(
      <KPITile
        label="Foo"
        value={42}
        hint="vs prior period"
        sparkline={<span data-testid="sl" />}
      />
    );
    expect(screen.getByText('vs prior period')).toBeInTheDocument();
    expect(screen.getByTestId('sl')).toBeInTheDocument();
    expect(container.querySelector('.ja-kpi-tile__sparkline')).toBeInTheDocument();
  });
});
