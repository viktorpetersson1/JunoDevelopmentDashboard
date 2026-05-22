import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Select } from '../Select';

const OPTIONS = [
  { value: 'base', label: 'Base case' },
  { value: 'opt', label: 'Optimistic' },
];

describe('Select', () => {
  it('renders all options + label', () => {
    render(<Select label="Scenario" options={OPTIONS} defaultValue="base" />);
    expect(screen.getByLabelText('Scenario')).toBeInTheDocument();
    expect(screen.getByText('Base case')).toBeInTheDocument();
    expect(screen.getByText('Optimistic')).toBeInTheDocument();
  });

  it('fires onChange on selection', () => {
    const handleChange = vi.fn();
    render(
      <Select label="Scenario" options={OPTIONS} defaultValue="base" onChange={handleChange} />
    );
    fireEvent.change(screen.getByLabelText('Scenario'), { target: { value: 'opt' } });
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('disabled state', () => {
    render(<Select label="Scenario" options={OPTIONS} defaultValue="base" disabled />);
    expect(screen.getByLabelText('Scenario')).toBeDisabled();
  });

  it('shows placeholder option when provided', () => {
    render(<Select label="Scenario" options={OPTIONS} placeholder="Pick one" defaultValue="" />);
    expect(screen.getByText('Pick one')).toBeInTheDocument();
  });
});
