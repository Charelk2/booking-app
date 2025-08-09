import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import { SectionList } from '..';

describe('SectionList', () => {
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

  it('renders footer when provided', () => {
    act(() => {
      root.render(
        React.createElement(SectionList, {
          title: 'Test',
          data: [1],
          emptyState: React.createElement('span', null, 'Empty'),
          renderItem: () => React.createElement('div', null, 'item'),
          footer: React.createElement('span', null, 'Footer'),
        })
      );
    });
    expect(container.textContent).toContain('Footer');
  });
});
