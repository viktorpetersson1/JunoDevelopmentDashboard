import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScenarioChip } from '../ScenarioChip';

describe('ScenarioChip', () => {
  it('renders base scenario by default', () => {
    render(<ScenarioChip label="Base" />);
    const chip = screen.getByRole('button', { name: 'Base' });
    expect(chip.className).toContain('ja-scenario-chip');
    expect(chip.className).toContain('ja-scenario-chip--base');
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  it('applies optimistic + pessimistic scenario modifiers', () => {
    const { rerender } = render(<ScenarioChip label="Up" scenario="optimistic" />);
    expect(screen.getByRole('button', { name: 'Up' }).className).toContain(
      'ja-scenario-chip--optimistic'
    );
    rerender(<ScenarioChip label="Down" scenario="pessimistic" />);
    expect(screen.getByRole('button', { name: 'Down' }).className).toContain(
      'ja-scenario-chip--pessimistic'
    );
  });

  it('active modifier + onClick', () => {
    const handleClick = vi.fn();
    render(<ScenarioChip label="Base" active onClick={handleClick} />);
    const chip = screen.getByRole('button', { name: 'Base' });
    expect(chip.className).toContain('ja-scenario-chip--active');
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(chip);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
