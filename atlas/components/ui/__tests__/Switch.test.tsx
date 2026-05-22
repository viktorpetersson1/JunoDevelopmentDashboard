import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Switch } from '../Switch';

describe('Switch', () => {
  it('renders as role=switch unchecked by default', () => {
    render(<Switch label="Notifications" />);
    const sw = screen.getByRole('switch', { name: 'Notifications' });
    expect(sw).not.toBeChecked();
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });

  it('reflects checked state', () => {
    render(<Switch label="Notifications" checked onChange={() => {}} />);
    const sw = screen.getByRole('switch', { name: 'Notifications' });
    expect(sw).toBeChecked();
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });

  it('fires onChange when toggled', () => {
    const handleChange = vi.fn();
    render(<Switch label="On" onChange={handleChange} />);
    fireEvent.click(screen.getByRole('switch', { name: 'On' }));
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('disabled state sets disabled attribute', () => {
    const handleChange = vi.fn();
    render(<Switch label="Off" disabled onChange={handleChange} />);
    const sw = screen.getByRole('switch', { name: 'Off' });
    expect(sw).toBeDisabled();
    expect(handleChange).not.toHaveBeenCalled();
  });
});
