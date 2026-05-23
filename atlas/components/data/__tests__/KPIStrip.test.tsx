import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KPIStrip } from '../KPIStrip';
import { KPITile } from '../KPITile';

describe('KPIStrip', () => {
  it('renders as a list role with default 4 columns', () => {
    render(
      <KPIStrip>
        <KPITile label="A" value="1" />
      </KPIStrip>
    );
    const strip = screen.getByRole('list', { name: 'KPI metrics' });
    expect(strip).toBeInTheDocument();
    expect((strip as HTMLElement).style.getPropertyValue('--ja-kpi-strip-cols')).toBe('4');
  });

  it('clamps columns prop to [3, 6]', () => {
    const { rerender } = render(
      <KPIStrip columns={3}>
        <KPITile label="A" value="1" />
      </KPIStrip>
    );
    expect(
      (screen.getByRole('list') as HTMLElement).style.getPropertyValue('--ja-kpi-strip-cols')
    ).toBe('3');

    rerender(
      <KPIStrip columns={6}>
        <KPITile label="A" value="1" />
      </KPIStrip>
    );
    expect(
      (screen.getByRole('list') as HTMLElement).style.getPropertyValue('--ja-kpi-strip-cols')
    ).toBe('6');
  });

  it('renders all child tiles', () => {
    render(
      <KPIStrip columns={3}>
        <KPITile label="A" value="1" />
        <KPITile label="B" value="2" />
        <KPITile label="C" value="3" />
      </KPIStrip>
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });
});
