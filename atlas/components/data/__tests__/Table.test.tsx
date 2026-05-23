import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Table, type TableColumn } from '../Table';

interface Project {
  id: string;
  name: string;
  budget: number;
}

const ROWS: Project[] = [
  { id: 'a', name: 'Alpha', budget: 1000 },
  { id: 'b', name: 'Beta', budget: 2000 },
];

const COLS: TableColumn<Project>[] = [
  { key: 'name', header: 'Project' },
  { key: 'budget', header: 'Budget', align: 'right' },
];

describe('Table', () => {
  it('renders columns + rows + accessible roles', () => {
    render(<Table columns={COLS} rows={ROWS} getRowKey={(r) => r.id} />);
    expect(screen.getByRole('columnheader', { name: 'Project' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Budget' })).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('1000')).toBeInTheDocument();
  });

  it('renders empty state when rows is empty', () => {
    render(
      <Table columns={COLS} rows={[]} getRowKey={(r) => r.id} empty={<span>Nothing yet</span>} />
    );
    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
  });

  it('fires onRowClick + applies right-align class on numeric cells', () => {
    const handleClick = vi.fn();
    const { container } = render(
      <Table columns={COLS} rows={ROWS} getRowKey={(r) => r.id} onRowClick={handleClick} />
    );
    fireEvent.click(screen.getByText('Alpha'));
    expect(handleClick).toHaveBeenCalledWith(ROWS[0]);
    expect(container.querySelector('.ja-table__td--right')).toBeInTheDocument();
  });

  it('uses col.render when provided', () => {
    const cols: TableColumn<Project>[] = [
      { key: 'name', header: 'Name', render: (r) => <strong>{r.name.toUpperCase()}</strong> },
    ];
    render(<Table columns={cols} rows={ROWS} getRowKey={(r) => r.id} />);
    expect(screen.getByText('ALPHA').tagName).toBe('STRONG');
  });
});
