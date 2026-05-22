import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Topbar } from '../Topbar';

describe('Topbar', () => {
  it('renders banner landmark + 3 scenario chips with active state', () => {
    render(<Topbar scenario="base" onScenarioChange={() => {}} />);
    expect(screen.getByRole('banner', { name: 'Page topbar' })).toBeInTheDocument();
    const base = screen.getByRole('button', { name: 'Base scenario' });
    const opt = screen.getByRole('button', { name: 'Optimistic scenario' });
    const pess = screen.getByRole('button', { name: 'Pessimistic scenario' });
    expect(base).toHaveAttribute('aria-pressed', 'true');
    expect(opt).toHaveAttribute('aria-pressed', 'false');
    expect(pess).toHaveAttribute('aria-pressed', 'false');
  });

  it('fires onScenarioChange when a scenario pill is clicked', () => {
    const handleChange = vi.fn();
    render(<Topbar scenario="base" onScenarioChange={handleChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Optimistic scenario' }));
    expect(handleChange).toHaveBeenCalledWith('optimistic');
  });

  it('renders search slot + actions slot when provided', () => {
    const handleSearchChange = vi.fn();
    render(
      <Topbar
        scenario="base"
        onScenarioChange={() => {}}
        search={{ value: 'q', onChange: handleSearchChange, placeholder: 'Find…' }}
        actions={<button>New</button>}
      />
    );
    const searchInput = screen.getByLabelText('Site search') as HTMLInputElement;
    expect(searchInput.value).toBe('q');
    fireEvent.change(searchInput, { target: { value: 'q2' } });
    expect(handleSearchChange).toHaveBeenCalledWith('q2');
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
  });
});
