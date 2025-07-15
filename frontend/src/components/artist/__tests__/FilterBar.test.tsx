import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import React from 'react';
import FilterBar from '../FilterBar';

describe('FilterBar component', () => {
  const categories = ['All', 'Band'];

  function renderBar() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <FilterBar
          categories={categories}
          onCategory={() => {}}
          location=""
          onLocation={() => {}}
          sort=""
          onSort={() => {}}
          filtersActive={false}
        />,
      );
    });
    return { container, root };
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('updates selected state when a pill is clicked', () => {
    const { container, root } = renderBar();
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(categories.length);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    act(() => {
      buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    act(() => root.unmount());
    container.remove();
  });
});
