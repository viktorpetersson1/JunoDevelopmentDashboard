import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ListPage } from '../ListPage';
import type { TableColumn } from '../../components/data';

interface Row {
  id: string;
  name: string;
}

const COLS: TableColumn<Row>[] = [{ key: 'name', header: 'Name' }];

describe('ListPage', () => {
  it('renders title, subtitle, table rows', () => {
    render(
      <ListPage
        title="Projects"
        subtitle="All deals"
        columns={COLS}
        rows={[{ id: '1', name: 'Alpha' }]}
        getRowKey={(r) => r.id}
      />
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByText('All deals')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  it('renders empty state with default copy when rows is empty', () => {
    render(<ListPage title="Risks" columns={COLS} rows={[]} getRowKey={(r) => r.id} />);
    expect(screen.getByText(/No risks yet/)).toBeInTheDocument();
  });

  it('primary action button fires onClick', () => {
    const handle = vi.fn();
    render(
      <ListPage
        title="x"
        columns={COLS}
        rows={[]}
        getRowKey={(r) => r.id}
        primaryAction={{ label: 'New project', onClick: handle }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /New project/ }));
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('search input + result count when onSearchChange + resultCount provided', () => {
    const handleSearch = vi.fn();
    render(
      <ListPage
        title="x"
        columns={COLS}
        rows={[{ id: '1', name: 'Alpha' }]}
        getRowKey={(r) => r.id}
        onSearchChange={handleSearch}
        searchValue=""
        resultCount={1}
      />
    );
    const input = screen.getByLabelText('Search records') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'al' } });
    expect(handleSearch).toHaveBeenCalledWith('al');
    expect(screen.getByText('1 result')).toBeInTheDocument();
  });
});
