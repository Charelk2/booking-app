import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import { OverviewSection } from '..';

describe('OverviewSection', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders all stats with no toggle', () => {
    act(() => {
      root.render(
        React.createElement(OverviewSection, {
          primaryStats: [{ label: 'A', value: 1 }],
          secondaryStats: [{ label: 'B', value: 2 }],
        })
      );
    });
    expect(container.textContent).toContain('A');
    expect(container.textContent).toContain('B');
    expect(container.querySelector('button')).toBeNull();
  });
});
