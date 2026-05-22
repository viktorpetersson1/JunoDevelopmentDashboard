import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TabStrip } from '../TabStrip';
import { Tab } from '../Tab';

describe('TabStrip', () => {
  it('renders as a tablist with provided aria-label', () => {
    render(
      <TabStrip aria-label="Project sections">
        <Tab href="/a" active>
          A
        </Tab>
        <Tab href="/b">B</Tab>
      </TabStrip>
    );
    expect(screen.getByRole('tablist', { name: 'Project sections' })).toBeInTheDocument();
  });

  it('renders all child tabs', () => {
    render(
      <TabStrip aria-label="Tabs">
        <Tab href="/x">X</Tab>
        <Tab href="/y">Y</Tab>
        <Tab href="/z">Z</Tab>
      </TabStrip>
    );
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('accepts custom className on the tablist root', () => {
    const { container } = render(
      <TabStrip className="my-strip" aria-label="Tabs">
        <Tab href="/a">A</Tab>
      </TabStrip>
    );
    const tabList = container.querySelector('.ja-tab-strip') as HTMLElement;
    expect(tabList.className).toContain('my-strip');
  });
});
