import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Avatar } from '../Avatar';

describe('Avatar', () => {
  it('renders initials from a 2-part name when no src', () => {
    render(<Avatar name="Viktor Reeves" />);
    const av = screen.getByRole('img', { name: 'Viktor Reeves' });
    expect(av.className).toContain('ja-avatar');
    expect(av.className).toContain('ja-avatar--md');
    expect(av.textContent).toBe('VR');
  });

  it('renders single initial when name is one word', () => {
    render(<Avatar name="Cher" />);
    expect(screen.getByRole('img', { name: 'Cher' }).textContent).toBe('C');
  });

  it('renders image when src provided', () => {
    // Both the outer span (role=img + aria-label) and the inner <img> with
    // alt match getByRole — use the container to disambiguate to the root.
    const { container } = render(<Avatar name="Alice Chen" src="/avatars/alice.jpg" size="lg" />);
    const av = container.querySelector('.ja-avatar') as HTMLElement;
    expect(av.className).toContain('ja-avatar--lg');
    const img = av.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('/avatars/alice.jpg');
  });

  it('applies custom background colour on initials avatar', () => {
    render(<Avatar name="Marco Polo" color="#D1FAE5" />);
    const av = screen.getByRole('img', { name: 'Marco Polo' });
    expect(av.style.backgroundColor).toBe('rgb(209, 250, 229)');
  });
});
