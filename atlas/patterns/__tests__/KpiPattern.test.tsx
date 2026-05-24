import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiPattern } from '../KpiPattern';

const KPIS = [
  { label: 'IRR', value: '38%' },
  { label: 'MOIC', value: '1.5x' },
  { label: 'Peak Debt', value: '$3.4M' },
];

describe('KpiPattern', () => {
  it('renders KPI strip with all tiles', () => {
    render(<KpiPattern kpis={KPIS} chart={<div data-testid="chart" />} />);
    expect(screen.getByRole('list', { name: 'KPI metrics' })).toBeInTheDocument();
    expect(screen.getByText('IRR')).toBeInTheDocument();
    expect(screen.getByText('MOIC')).toBeInTheDocument();
    expect(screen.getByText('Peak Debt')).toBeInTheDocument();
  });

  it('renders chart slot + optional title + actions', () => {
    render(
      <KpiPattern
        kpis={KPIS}
        chart={<div data-testid="cf" />}
        chartTitle="Cash flow"
        chartActions={<button>Export</button>}
      />
    );
    expect(screen.getByTestId('cf')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Cash flow' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('renders rail slot when provided', () => {
    render(
      <KpiPattern kpis={KPIS} chart={<div />} rail={<aside data-testid="rail">RAIL</aside>} />
    );
    expect(screen.getByTestId('rail')).toHaveTextContent('RAIL');
  });
});
