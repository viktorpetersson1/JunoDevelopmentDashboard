import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Drawer } from '../Drawer';

describe('Drawer', () => {
  it('renders nothing when closed', () => {
    render(
      <Drawer open={false} onClose={() => {}} title="x">
        body
      </Drawer>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders dialog with title + body + footer when open', () => {
    render(
      <Drawer open onClose={() => {}} title="Filters" footer={<button>Apply</button>}>
        <p>filter options</p>
      </Drawer>
    );
    const dialog = screen.getByRole('dialog', { name: 'Filters' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('filter options')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
  });

  it('close button fires onClose', () => {
    const handle = vi.fn();
    render(
      <Drawer open onClose={handle} title="x">
        body
      </Drawer>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('Escape key fires onClose', () => {
    const handle = vi.fn();
    render(
      <Drawer open onClose={handle} title="y">
        body
      </Drawer>
    );
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'y' }), { key: 'Escape' });
    expect(handle).toHaveBeenCalledTimes(1);
  });
});
