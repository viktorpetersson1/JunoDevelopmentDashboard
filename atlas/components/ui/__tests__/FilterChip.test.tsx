import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterChip } from '../FilterChip';

describe('FilterChip', () => {
  it('renders inactive by default with aria-pressed=false', () => {
    render(<FilterChip label="In progress" />);
    const chip = screen.getByRole('button', { name: 'In progress' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(chip.className).not.toContain('ja-filter-chip--active');
  });

  it('applies active modifier when active', () => {
    render(<FilterChip label="Active" active />);
    const chip = screen.getByRole('button', { name: 'Active' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(chip.className).toContain('ja-filter-chip--active');
  });

  it('renders badge count when value > 0', () => {
    render(<FilterChip label="Stage" value={3} active />);
    expect(screen.getByLabelText('3 selected')).toHaveTextContent('3');
  });

  it('shows clear button when active + onClear provided; calls onClear', () => {
    const handleClear = vi.fn();
    render(<FilterChip label="Stage" active onClear={handleClear} />);
    const clearBtn = screen.getByLabelText('Clear Stage filter');
    fireEvent.click(clearBtn);
    expect(handleClear).toHaveBeenCalledTimes(1);
  });

  it('disabled state', () => {
    render(<FilterChip label="Off" disabled />);
    expect(screen.getByRole('button', { name: 'Off' })).toBeDisabled();
  });
});
