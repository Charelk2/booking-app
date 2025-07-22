import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import React from 'react';
import FilterBar from '../FilterBar';
import useIsMobile from '@/hooks/useIsMobile';

const flushPromises = async () => {
  await act(async () => {});
};

jest.mock('@/hooks/useIsMobile');

describe('FilterBar component', () => {
  const categories = ['A', 'B', 'C', 'D'].map((c) => ({ value: c, label: c }));

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
          onLocation={() => {
            /* noop */
          }}
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

  it('shows pills and popover on desktop', async () => {
    (useIsMobile as jest.Mock).mockReturnValue(false);
    const { container, root } = renderBar();
    const pills = container.querySelectorAll('button[aria-pressed]');
    expect(pills).toHaveLength(3);
    const more = container.querySelector('[data-testid="more-filters"]');
    expect(more).not.toBeNull();
    await act(async () => {
      (more as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
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

  it('applies filters and calls onApply on mobile', async () => {
    (useIsMobile as jest.Mock).mockReturnValue(true);
    const onApply = jest.fn();
    const onCategory = jest.fn();
    const { container, root } = renderBar({ onApply, onCategory });
    const btn = container.querySelector('button') as HTMLElement;
    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
    });
    const firstCheck = document.querySelector('input[type="checkbox"]') as HTMLElement;
    await act(async () => {
      firstCheck.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
    });
    const applyBtn = Array.from(document.querySelectorAll('button')).find(
      (el) => el.textContent === 'Apply filters',
    ) as HTMLElement;
    await act(async () => {
      applyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
    });
    expect(onCategory).toHaveBeenCalledWith(categories[0].value);
    expect(onApply).toHaveBeenCalled();
    expect(document.activeElement).toBe(btn);
    act(() => root.unmount());
    container.remove();
  });

  it('updates location via autocomplete', async () => {
    (useIsMobile as jest.Mock).mockReturnValue(false);
    const onLocation = jest.fn();
    const { container, root } = renderBar({ onLocation });
    const mock = (global as { mockAutocomplete: jest.Mock }).mockAutocomplete;
    const instance = mock.mock.instances[0];
    instance.getPlace.mockReturnValue({ formatted_address: 'New York, NY' });
    await act(async () => {
      instance._cb();
      await flushPromises();
    });
    expect(onLocation).toHaveBeenCalledWith('New York, NY');
    act(() => root.unmount());
    container.remove();
  });

  it('opens map modal on button click', () => {
    (useIsMobile as jest.Mock).mockReturnValue(false);
    const { container, root } = renderBar();
    const btn = container.querySelector('[data-testid="open-map-modal"]') as HTMLButtonElement;
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.querySelector('[data-testid="location-map-modal"]')).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it('closes map modal on button click', () => {
    (useIsMobile as jest.Mock).mockReturnValue(false);
    const { container, root } = renderBar();
    const openBtn = container.querySelector('[data-testid="open-map-modal"]') as HTMLButtonElement;
    act(() => {
      openBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const btn = document.querySelector('[data-testid="location-map-modal"] button[type="button"]') as HTMLButtonElement;
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.querySelector('[data-testid="location-map-modal"]')).toBeNull();
    act(() => root.unmount());
    container.remove();
  });
});
