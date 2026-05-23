import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tag } from '../Tag';

describe('Tag', () => {
  it('renders content with default md size', () => {
    render(<Tag>Hamptons</Tag>);
    const tag = screen.getByText('Hamptons');
    expect(tag.className).toContain('ja-tag');
    expect(tag.className).toContain('ja-tag--md');
  });

  it('applies sm size modifier', () => {
    render(<Tag size="sm">Villa</Tag>);
    expect(screen.getByText('Villa').className).toContain('ja-tag--sm');
  });

  it('accepts custom className', () => {
    render(<Tag className="my-tag">x</Tag>);
    expect(screen.getByText('x').className).toContain('my-tag');
  });
});
