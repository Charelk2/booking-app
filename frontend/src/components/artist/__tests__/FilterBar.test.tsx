import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import React from 'react';
import FilterBar from '../FilterBar';
import useIsMobile from '@/hooks/useIsMobile';

jest.mock('@/hooks/useIsMobile');

describe('FilterBar component', () => {
  const categories = ['A', 'B', 'C', 'D'];

  function renderBar(props: Partial<React.ComponentProps<typeof FilterBar>> = {}) {
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
          onApply={() => {}}
          filtersActive={false}
          {...props}
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

  it('applies filters and calls onApply on mobile', () => {
    (useIsMobile as jest.Mock).mockReturnValue(true);
    const onApply = jest.fn();
    const onCategory = jest.fn();
    const { container, root } = renderBar({ onApply, onCategory });
    const btn = container.querySelector('button') as HTMLElement;
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const firstCheck = document.querySelector('input[type="checkbox"]') as HTMLElement;
    act(() => {
      firstCheck.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const applyBtn = Array.from(document.querySelectorAll('button')).find(
      (el) => el.textContent === 'Apply filters',
    ) as HTMLElement;
    act(() => {
      applyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onCategory).toHaveBeenCalledWith(categories[0]);
    expect(onApply).toHaveBeenCalled();
    expect(document.activeElement).toBe(btn);
    act(() => root.unmount());
    container.remove();
  });
});
