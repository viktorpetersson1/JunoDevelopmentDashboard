import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Card } from '../Card';

describe('Card', () => {
  it('renders as div by default with default padding', () => {
    const { container } = render(<Card>Hello</Card>);
    const card = container.querySelector('.ja-card') as HTMLElement;
    expect(card.tagName).toBe('DIV');
    expect(card.style.getPropertyValue('--ja-card-padding')).toBe('24px');
    expect(card.textContent).toBe('Hello');
  });

  it('renders as polymorphic element when as prop is set', () => {
    const { container } = render(
      <Card as="a" href="/x">
        Link card
      </Card>
    );
    const card = container.querySelector('.ja-card') as HTMLElement;
    expect(card.tagName).toBe('A');
    expect(card.getAttribute('href')).toBe('/x');
  });

  it('applies interactive modifier + custom padding', () => {
    const { container } = render(
      <Card interactive padding={16}>
        Click me
      </Card>
    );
    const card = container.querySelector('.ja-card') as HTMLElement;
    expect(card.className).toContain('ja-card--interactive');
    expect(card.style.getPropertyValue('--ja-card-padding')).toBe('16px');
  });
});
