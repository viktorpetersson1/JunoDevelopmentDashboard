import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from '../Input';

describe('Input', () => {
  it('renders with label + hint', () => {
    render(<Input label="Project name" hint="Required" defaultValue="" />);
    expect(screen.getByLabelText('Project name')).toBeInTheDocument();
    expect(screen.getByText('Required')).toBeInTheDocument();
  });

  it('calls onChange on input', () => {
    const handleChange = vi.fn();
    render(<Input label="Email" onChange={handleChange} />);
    const input = screen.getByLabelText('Email');
    fireEvent.change(input, { target: { value: 'a@b.c' } });
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('invalid + disabled states', () => {
    render(<Input label="Email" invalid hint="Bad email" disabled />);
    const input = screen.getByLabelText('Email');
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    // Hint role=alert when invalid
    expect(screen.getByRole('alert')).toHaveTextContent('Bad email');
  });

  it('renders prefix + suffix affixes', () => {
    render(
      <Input
        label="Budget"
        prefix={<span>$</span>}
        suffix={<span>USD</span>}
        type="number"
      />
    );
    expect(screen.getByText('$')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
  });
});
