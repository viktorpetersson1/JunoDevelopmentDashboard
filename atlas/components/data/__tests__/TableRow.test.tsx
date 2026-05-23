import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TableRow } from '../TableRow';

function wrap(children: React.ReactNode) {
  return (
    <table>
      <tbody>{children}</tbody>
    </table>
  );
}

describe('TableRow', () => {
  it('renders non-interactive row by default', () => {
    render(
      wrap(
        <TableRow>
          <td>a</td>
        </TableRow>
      )
    );
    const row = screen.getByRole('row');
    expect(row.className).toContain('ja-table__row');
    expect(row.className).not.toContain('ja-table__row--interactive');
    expect(row).not.toHaveAttribute('tabindex');
  });

  it('marks as interactive when onClick provided + fires on click', () => {
    const handle = vi.fn();
    render(
      wrap(
        <TableRow onClick={handle}>
          <td>x</td>
        </TableRow>
      )
    );
    const row = screen.getByRole('row');
    expect(row).toHaveAttribute('tabindex', '0');
    expect(row.className).toContain('ja-table__row--interactive');
    fireEvent.click(row);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('Enter + Space keys fire onClick on interactive rows', () => {
    const handle = vi.fn();
    render(
      wrap(
        <TableRow onClick={handle}>
          <td>x</td>
        </TableRow>
      )
    );
    const row = screen.getByRole('row');
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    expect(handle).toHaveBeenCalledTimes(2);
  });

  it('selected modifier + aria-selected', () => {
    render(
      wrap(
        <TableRow selected>
          <td>x</td>
        </TableRow>
      )
    );
    const row = screen.getByRole('row');
    expect(row.className).toContain('ja-table__row--selected');
    expect(row).toHaveAttribute('aria-selected', 'true');
  });
});
