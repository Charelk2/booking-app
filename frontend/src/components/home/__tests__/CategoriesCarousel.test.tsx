import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import CategoriesCarousel from '../CategoriesCarousel';
import { UI_CATEGORIES } from '@/lib/categoryMap';

describe('CategoriesCarousel', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders categories with navigation buttons', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(React.createElement(CategoriesCarousel));
    });
    UI_CATEGORIES.forEach((cat) => {
      expect(container.textContent).toContain(cat.label);
    });
    const imgs = container.querySelectorAll('img');
    UI_CATEGORIES.forEach((cat, index) => {
      expect(imgs[index].getAttribute('src')).toBe(cat.image);
    });
    const next = container.querySelector('button[aria-label="Next"]');
    expect(next).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it('links categories to the homepage with query params', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(React.createElement(CategoriesCarousel));
    });
    const firstLink = container.querySelector('a');
    expect(firstLink?.getAttribute('href')).toBe('/?category=musician');
    act(() => root.unmount());
    container.remove();
  });

  it('scrolls when clicking the next button', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(React.createElement(CategoriesCarousel));
    });
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

  it('applies correct spacing and dimensions', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(React.createElement(CategoriesCarousel));
    });

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
    expect(label?.className).toContain('absolute');
    expect(label?.className).toContain('left-2');
    expect(label?.className).toContain('bottom-2');


    act(() => root.unmount());
    container.remove();
  });
});
