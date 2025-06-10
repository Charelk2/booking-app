import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import OverviewAccordion from '../OverviewAccordion';

describe('OverviewAccordion', () => {
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

  it('renders primary stats and hides secondary by default', () => {
    act(() => {
      root.render(
        React.createElement(OverviewAccordion, {
          primaryStats: [{ label: 'A', value: 1 }],
          secondaryStats: [{ label: 'B', value: 2 }],
        })
      );
    });
    expect(container.textContent).toContain('A');
    const detailsEl = container.querySelector('details');
    expect(detailsEl?.hasAttribute('open')).toBe(false);
  });
});
