/**
 * AJ-v4 — safe-markdown renderer. The contract that matters: model output
 * becomes React elements (never innerHTML), unsafe link schemes are
 * stripped, and the mini-grammar (bold/code/lists/tables/links) renders.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { renderMarkdown } from '../markdown';

afterEach(cleanup);

const mount = (md: string) => render(<div data-testid="root">{renderMarkdown(md)}</div>);

describe('renderMarkdown', () => {
  it('renders bold, italic and code inline', () => {
    mount('The margin is **21.4%** on *net* revenue via `runProject`.');
    expect(screen.getByText('21.4%').tagName).toBe('STRONG');
    expect(screen.getByText('net').tagName).toBe('EM');
    expect(screen.getByText('runProject').tagName).toBe('CODE');
  });

  it('renders internal links as anchors and keeps external links target=_blank', () => {
    mount('See [84 Sunset](/projects/p12) and [Zillow](https://zillow.com/x).');
    const internal = screen.getByRole('link', { name: '84 Sunset' });
    expect(internal.getAttribute('href')).toBe('/projects/p12');
    const external = screen.getByRole('link', { name: 'Zillow' });
    expect(external.getAttribute('target')).toBe('_blank');
    expect(external.getAttribute('rel')).toContain('noopener');
  });

  it('REFUSES unsafe link schemes — label stays, no anchor', () => {
    mount('Click [here](javascript:alert(1)) now.');
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/here/)).toBeTruthy();
  });

  it('never injects raw HTML — tags render as literal text', () => {
    mount('<img src=x onerror=alert(1)> and <script>boom()</script>');
    const root = screen.getByTestId('root');
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('script')).toBeNull();
    expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('renders GFM pipe tables with header + body', () => {
    mount(['| Project | Margin |', '| --- | --- |', '| 84 Sunset | **21%** |'].join('\n'));
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Project' })).toBeTruthy();
    expect(screen.getByText('21%').tagName).toBe('STRONG');
  });

  it('renders unordered and ordered lists', () => {
    mount('- first\n- second\n\n1. alpha\n2. beta');
    const lists = screen.getAllByRole('list');
    expect(lists).toHaveLength(2);
    expect(lists[0]!.tagName).toBe('UL');
    expect(lists[1]!.tagName).toBe('OL');
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('keeps plain multiline text as paragraphs with breaks (no crash on odd input)', () => {
    mount('line one\nline two\n\nsecond para with 5 * 3 = 15 and a | pipe');
    const root = screen.getByTestId('root');
    expect(root.querySelectorAll('p')).toHaveLength(2);
    // "5 * 3" must NOT become italics.
    expect(root.textContent).toContain('5 * 3 = 15');
  });
});
