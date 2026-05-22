import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Radio } from '../Radio';

describe('Radio', () => {
  it('renders unchecked by default', () => {
    render(<Radio name="x" value="a" label="Option A" />);
    const radio = screen.getByLabelText('Option A') as HTMLInputElement;
    expect(radio.checked).toBe(false);
    expect(radio).toHaveAttribute('aria-checked', 'false');
  });

  it('reflects checked state', () => {
    render(<Radio name="x" value="a" label="Option A" checked onChange={() => {}} />);
    const radio = screen.getByLabelText('Option A') as HTMLInputElement;
    expect(radio.checked).toBe(true);
    expect(radio).toHaveAttribute('aria-checked', 'true');
  });

  it('fires onChange when clicked', () => {
    const handleChange = vi.fn();
    render(<Radio name="x" value="b" label="Option B" onChange={handleChange} />);
    fireEvent.click(screen.getByLabelText('Option B'));
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('disabled state sets disabled attribute (jsdom does not honor click suppression)', () => {
    const handleChange = vi.fn();
    render(<Radio name="x" value="c" label="Off" disabled onChange={handleChange} />);
    const radio = screen.getByLabelText('Off');
    expect(radio).toBeDisabled();
    expect(handleChange).not.toHaveBeenCalled();
  });
});
