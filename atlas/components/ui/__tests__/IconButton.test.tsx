import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IconButton } from '../IconButton';

describe('IconButton', () => {
  it('renders with required aria-label', () => {
    render(
      <IconButton aria-label="Close panel">
        <svg />
      </IconButton>
    );
    const btn = screen.getByRole('button', { name: 'Close panel' });
    expect(btn.className).toContain('ja-icon-button');
    expect(btn.className).toContain('ja-icon-button--ghost');
    expect(btn.className).toContain('ja-icon-button--md');
  });

  it('applies outline variant + sm size modifiers', () => {
    render(
      <IconButton aria-label="Settings" variant="outline" size="sm">
        <svg />
      </IconButton>
    );
    const btn = screen.getByRole('button', { name: 'Settings' });
    expect(btn.className).toContain('ja-icon-button--outline');
    expect(btn.className).toContain('ja-icon-button--sm');
  });

  it('disabled state', () => {
    render(
      <IconButton aria-label="Disabled" disabled>
        <svg />
      </IconButton>
    );
    const btn = screen.getByRole('button', { name: 'Disabled' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-disabled', 'true');
  });
});
