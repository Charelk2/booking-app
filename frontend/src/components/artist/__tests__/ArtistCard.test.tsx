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
    expect(c1.textContent).toContain('$100');
    act(() => r1.unmount());
    c1.remove();

    const { container: c2, root: r2 } = setup({ price: '$200', priceVisible: false });
    expect(c2.textContent).not.toContain('$200');
    act(() => r2.unmount());
    c2.remove();
  });

  it('shows location and tagline clamped', () => {
    const { container, root } = setup({ location: 'NYC', subtitle: 'Best artist ever in the world' });
    expect(container.textContent).toContain('NYC');
    const subtitleEl = container.querySelector('p.text-sm');
    expect(subtitleEl?.className).toContain('line-clamp-2');
    act(() => root.unmount());
    container.remove();
  });

  it('shows verified badge and availability', () => {
    const { container, root } = setup({ verified: true, isAvailable: false });
    const badge = container.querySelector('svg');
    expect(badge).not.toBeNull();
    expect(container.textContent).toContain('Unavailable');
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
});
