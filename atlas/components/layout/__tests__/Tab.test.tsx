import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Tab } from '../Tab';

describe('Tab', () => {
  it('renders as anchor when href is provided + aria-current=page when active', () => {
    render(
      <Tab href="/summary" active>
        Summary
      </Tab>
    );
    const link = screen.getByRole('link', { name: 'Summary' });
    expect(link).toHaveAttribute('href', '/summary');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link.className).toContain('ja-tab--active');
  });

  it('renders as button when href is omitted + has role=tab + aria-selected', () => {
    const handleClick = vi.fn();
    render(
      <Tab onClick={handleClick} active>
        Forecast
      </Tab>
    );
    const btn = screen.getByRole('tab', { name: 'Forecast' });
    expect(btn).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(btn);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders count badge when count provided', () => {
    render(
      <Tab href="/risks" count={4}>
        Risks
      </Tab>
    );
    expect(screen.getByLabelText('4 items')).toHaveTextContent('4');
  });
});
