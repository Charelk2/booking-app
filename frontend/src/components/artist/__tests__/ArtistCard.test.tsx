import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import ArtistCard from '../ArtistCard';

function setup(props = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const allProps = {
    id: 1,
    name: 'Test Artist',
    href: '/artists/1',
    ...props,
  };
  act(() => {
    root.render(React.createElement(ArtistCard, allProps));
  });
  return { container, root };
}

describe('ArtistCard optional fields', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders price when visible and hides when not', () => {
    const { container: c1, root: r1 } = setup({ price: '$100', priceVisible: true });
    expect(c1.textContent).toContain('R$100');
    act(() => r1.unmount());
    c1.remove();

    const { container: c2, root: r2 } = setup({ price: '$200', priceVisible: false });
    expect(c2.textContent).toContain('Price available after request');
    act(() => r2.unmount());
    c2.remove();
  });

  it('shows location and tagline truncated', () => {
    const { container, root } = setup({ location: 'NYC', subtitle: 'Best artist ever in the world' });
    expect(container.textContent).toContain('NYC');
    const subtitleEl = container.querySelector('p.text-sm');
    expect(subtitleEl?.className).toContain('line-clamp-2');
    const locEl = container.querySelector('span.text-gray-500');
    expect(locEl?.textContent).toContain('NYC');
    act(() => root.unmount());
    container.remove();
  });

  it('shows verified badge and availability', () => {
    const { container, root } = setup({ verified: true, isAvailable: false });
    const badge = container.querySelector('svg');
    expect(badge).not.toBeNull();
    expect(container.textContent).toContain('Currently unavailable');
    const availPill = container.querySelector('span.bg-gray-200');
    expect(availPill).not.toBeNull();
    if (availPill) {
      expect(availPill.className).toContain('text-gray-500');
    }
    act(() => root.unmount());
    container.remove();
  });

  it('displays rating and review count', () => {
    const { container, root } = setup({ rating: 4.5, ratingCount: 10 });
    expect(container.textContent).toContain('4.5');
    expect(container.textContent).toContain('(10)');
    act(() => root.unmount());
    container.remove();
  });

  it('falls back to default avatar on image error', () => {
    const { container, root } = setup({ imageUrl: '/missing.jpg' });
    const img = container.querySelector('img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    if (img) {
      act(() => {
        img.dispatchEvent(new Event('error'));
      });
      expect(img.src).toContain('/default-avatar.svg');
    }
    act(() => root.unmount());
    container.remove();
  });

  it('uses default avatar when imageUrl is not provided', () => {
    const { container, root } = setup();
    const img = container.querySelector('img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    if (img) {
      expect(img.src).toContain('/default-avatar.svg');
    }
    act(() => root.unmount());
    container.remove();
  });

  it('renders availability pill only when isAvailable is defined', () => {
    const { container, root } = setup({ isAvailable: false });
    const pill = container.querySelector('span.bg-gray-200');
    expect(pill).not.toBeNull();
    act(() => root.unmount());
    container.remove();

    const { container: c2, root: r2 } = setup();
    expect(c2.querySelector('span.bg-gray-200')).toBeNull();
    expect(c2.querySelector('span.bg-green-100')).toBeNull();
    act(() => r2.unmount());
    c2.remove();
  });

  it('applies rounded-lg class to the action button', () => {
    const { container, root } = setup();
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('rounded-lg');
    act(() => root.unmount());
    container.remove();
  });
});
