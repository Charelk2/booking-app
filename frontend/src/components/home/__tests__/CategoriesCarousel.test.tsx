import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import CategoriesCarousel from '../CategoriesCarousel';
import { getServiceCategories } from '@/lib/api';
import { flushPromises } from '@/test/utils/flush';

jest.mock('@/lib/api');

const mockedGetServiceCategories = getServiceCategories as jest.MockedFunction<
  typeof getServiceCategories
>;

const MOCK_CATEGORIES = [
  { id: 0, name: 'Service Providers' },
  { id: 1, name: 'DJ' },
  { id: 2, name: 'Musician' },
];

describe('CategoriesCarousel', () => {
  beforeEach(() => {
    mockedGetServiceCategories.mockResolvedValue({ data: MOCK_CATEGORIES } as any);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('renders categories with navigation buttons', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(React.createElement(CategoriesCarousel));
    });
    await flushPromises();
    expect(container.textContent).toContain("DJ's");
    expect(container.textContent).toContain('Musicians');
    expect(container.textContent).not.toContain('Service Providers');
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(2);
    expect(imgs[0].getAttribute('src')).toContain('dj');
    expect(imgs[1].getAttribute('src')).toContain('musician');
    const next = container.querySelector('button[aria-label="Next"]');
    expect(next).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it('scrolls when clicking the next button', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(React.createElement(CategoriesCarousel));
    });
    await flushPromises();
    const scroller = container.querySelector(
      '[data-testid="categories-scroll"]',
    ) as HTMLDivElement;
    Object.defineProperty(scroller, 'scrollWidth', {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(scroller, 'clientWidth', {
      configurable: true,
      value: 500,
    });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    const next = container.querySelector(
      'button[aria-label="Next"]',
    ) as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    const mock = jest.fn();
    scroller.scrollBy = mock;
    act(() => {
      next.click();
    });
    expect(mock).toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });

  it('applies correct spacing and dimensions', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(React.createElement(CategoriesCarousel));
    });
    await flushPromises();

    const section = container.querySelector('section');
    expect(section?.className).toContain('px-4');
    expect(section?.className).toContain('sm:px-6');
    expect(section?.className).toContain('lg:px-8');

    const scroller = container.querySelector('[data-testid="categories-scroll"]');
    expect(scroller?.className).toContain('scrollbar-hide');

    const wrapper = container.querySelector('a div.relative');
    expect(wrapper?.className).toContain('w-40');
    expect(wrapper?.className).toContain('h-40');

    const label = container.querySelector('a p');
    expect(label?.className).toContain('mt-2');
    expect(label?.className).toContain('text-sm');
    expect(label?.className).toContain('font-semibold');

    act(() => root.unmount());
    container.remove();
  });
});
