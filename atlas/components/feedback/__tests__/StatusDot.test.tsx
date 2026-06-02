import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusDot, StatusDotGroup } from '../StatusDot';

describe('StatusDot', () => {
  it('renders the dot with the correct aria-label', () => {
    render(<StatusDot severity="warning" title="Stale data" message="Data is stale." />);
    expect(screen.getByRole('img', { name: /warning: stale data/i })).toBeTruthy();
  });

  it('renders nothing when suppressIfZero={0}', () => {
    const { container } = render(
      <StatusDot severity="error" title="YoY" message="0% change" suppressIfZero={0} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when suppressIfZero is non-finite (NaN)', () => {
    const { container } = render(
      <StatusDot severity="error" title="YoY" message="—" suppressIfZero={NaN} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders when suppressIfZero is a non-zero finite number', () => {
    render(
      <StatusDot severity="info" title="YoY" message="5% up" suppressIfZero={0.05} />
    );
    expect(screen.getByRole('img', { name: /info: yoy/i })).toBeTruthy();
  });

  it('shows the popover title and message on hover', () => {
    render(<StatusDot severity="error" title="Breach" message="LTC exceeds threshold." />);
    const dot = screen.getByRole('img', { name: /error: breach/i });
    fireEvent.mouseEnter(dot.parentElement!);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    expect(screen.getByText('Breach')).toBeTruthy();
    expect(screen.getByText('LTC exceeds threshold.')).toBeTruthy();
  });

  it('renders adjacent children next to the dot', () => {
    render(
      <StatusDot severity="info" title="Stale" message="msg">
        Market intelligence
      </StatusDot>
    );
    expect(screen.getByText('Market intelligence')).toBeTruthy();
  });
});

describe('StatusDotGroup', () => {
  it('renders children in an inline-flex container', () => {
    const { container } = render(
      <StatusDotGroup>
        <StatusDot severity="info" title="A" message="a" />
        <StatusDot severity="warning" title="B" message="b" />
      </StatusDotGroup>
    );
    expect(container.querySelector('span')).toBeTruthy();
  });
});
