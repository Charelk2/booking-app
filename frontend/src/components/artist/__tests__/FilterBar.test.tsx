import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import React from 'react';
import FilterBar from '../FilterBar';
import useIsMobile from '@/hooks/useIsMobile';

jest.mock('@/hooks/useIsMobile');

describe('FilterBar component', () => {
  const categories = ['A', 'B', 'C', 'D'];

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

  it('shows pills and popover on desktop', () => {
    (useIsMobile as jest.Mock).mockReturnValue(false);
    const { container, root } = renderBar();
    const pills = container.querySelectorAll('button[aria-pressed]');
    expect(pills).toHaveLength(3);
    const more = container.querySelector('[data-testid="more-filters"]');
    expect(more).not.toBeNull();
    act(() => {
      (more as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('input[type="checkbox"]')).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it('shows single Filters button on mobile', () => {
    (useIsMobile as jest.Mock).mockReturnValue(true);
    const { container, root } = renderBar();
    const btn = container.querySelector('button');
    expect(btn?.textContent).toContain('Filters');
    act(() => root.unmount());
    container.remove();
  });
});
