import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '../Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={() => {}} title="x">
        body
      </Modal>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders dialog with title + description + body when open', () => {
    render(
      <Modal open onClose={() => {}} title="Confirm" description="Are you sure?">
        <p>body text</p>
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { level: 2, name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    expect(screen.getByText('body text')).toBeInTheDocument();
  });

  it('fires onClose when close × button is clicked + when Esc pressed', () => {
    const handleClose = vi.fn();
    render(
      <Modal open onClose={handleClose} title="x">
        body
      </Modal>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(handleClose).toHaveBeenCalledTimes(1);

    handleClose.mockClear();
    // Re-mount fresh state for the Esc test
    const { unmount } = render(
      <Modal open onClose={handleClose} title="y">
        body
      </Modal>
    );
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'y' }), { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('applies size variant class', () => {
    render(
      <Modal open onClose={() => {}} title="x" size="lg">
        body
      </Modal>
    );
    expect(screen.getByRole('dialog').className).toContain('ja-modal--lg');
  });
});
