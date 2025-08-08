import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import CategoriesCarousel from '../CategoriesCarousel';
import { UI_CATEGORIES } from '@/lib/categoryMap';

describe('CategoriesCarousel', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders all category labels with images', () => {
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
    act(() => root.unmount());
    container.remove();
  });
});
