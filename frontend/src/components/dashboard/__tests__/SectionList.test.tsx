import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import SectionList from '../SectionList';

describe('SectionList', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it('shows empty state when data is empty', () => {
    act(() => {
      root.render(
        React.createElement(SectionList, {
          title: 'Test',
          data: [],
          emptyState: React.createElement('span', null, 'Empty'),
          renderItem: () => React.createElement('div', null, 'item'),
        })
      );
    });
    expect(container.textContent).toContain('Empty');
  });
});
