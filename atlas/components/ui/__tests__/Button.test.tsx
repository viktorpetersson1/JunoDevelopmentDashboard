import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../Button';

describe('Button', () => {
  it('renders with default variant + size', () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn.className).toContain('ja-button');
    expect(btn.className).toContain('ja-button--secondary');
    expect(btn.className).toContain('ja-button--md');
    expect(btn).not.toBeDisabled();
  });

  it('applies variant + size + fullWidth modifiers', () => {
    render(
      <Button variant="primary" size="lg" fullWidth>
        Submit
      </Button>
    );
    const btn = screen.getByRole('button', { name: 'Submit' });
    expect(btn.className).toContain('ja-button--primary');
    expect(btn.className).toContain('ja-button--lg');
    expect(btn.className).toContain('ja-button--full-width');
  });

  it('disables click + sets aria-disabled when loading', () => {
    const handleClick = vi.fn();
    render(
      <Button loading onClick={handleClick}>
        Loading
      </Button>
    );
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(btn);
    expect(handleClick).not.toHaveBeenCalled();
  });
});
