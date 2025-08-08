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
    const prev = container.querySelector('button[aria-label="Previous"]');
    const next = container.querySelector('button[aria-label="Next"]');
    expect(prev).not.toBeNull();
    expect(next).not.toBeNull();
    expect((prev as HTMLButtonElement).disabled).toBe(true);
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
});
