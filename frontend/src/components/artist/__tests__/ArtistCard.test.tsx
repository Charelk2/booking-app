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
    const { container: c1, root: r1 } = setup({ price: 100, priceVisible: true });
    expect(c1.textContent).toContain('from R100');
    act(() => r1.unmount());
    c1.remove();

    const { container: c2, root: r2 } = setup({ price: 200, priceVisible: false });
    expect(c2.textContent).not.toContain('200');
    act(() => r2.unmount());
    c2.remove();
  });

  it('shows location and tagline truncated', () => {
    const { container, root } = setup({ location: 'NYC', subtitle: 'Best artist ever in the world' });
    expect(container.textContent).toContain('NYC');
    const subtitleEl = container.querySelector('p.text-sm');
    expect(subtitleEl?.className).toContain('line-clamp-2');
    const locEl = container.querySelector('span.text-sm');
    expect(locEl?.textContent).toContain('NYC');
    act(() => root.unmount());
    container.remove();
  });

  it('shows verified badge', () => {
    const { container, root } = setup({ verified: true });
    const badge = container.querySelector('svg');
    expect(badge).not.toBeNull();
    expect(container.textContent).not.toContain('Currently unavailable');
    expect(container.textContent).not.toContain('Available');
    act(() => root.unmount());
    container.remove();
  });

  it('displays rating but hides review count', () => {
    const { container, root } = setup({ rating: 4.5, ratingCount: 10 });
    expect(container.textContent).toContain('4.5');
    expect(container.textContent).not.toContain('(10)');
    act(() => root.unmount());
    container.remove();
  });

  it('shows fallback when rating is missing', () => {
    const { container, root } = setup();
    expect(container.textContent).toContain('No ratings yet');
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
      expect(img.src).toContain('/static/default-avatar.svg');
    }
    act(() => root.unmount());
    container.remove();
  });

  it('uses default avatar when imageUrl is not provided', () => {
    const { container, root } = setup();
    const img = container.querySelector('img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    if (img) {
      expect(img.src).toContain('/static/default-avatar.svg');
    }
    act(() => root.unmount());
    container.remove();
  });

  it('wraps the image in a link to the artist profile', () => {
    const { container, root } = setup({ imageUrl: '/a.jpg', href: '/artists/9' });
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    const anchor = img?.closest('a');
    expect(anchor?.getAttribute('href')).toBe('/artists/9');
    act(() => root.unmount());
    container.remove();
  });


  it('applies rounded-md class to the action button', () => {
    const { container, root } = setup();
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('rounded-md');
    act(() => root.unmount());
    container.remove();
  });

  it('shows at most two specialty tags', () => {
    const { container, root } = setup({
      specialties: ['a', 'b', 'c', 'd', 'e', 'f'],
    });
    const tagContainer = container.querySelector('div.flex.flex-nowrap');
    const tags = tagContainer?.querySelectorAll('span');
    expect(tags?.length).toBeLessThanOrEqual(2);
    tags?.forEach((tag) => {
      expect(tag.className).toContain('text-[10px]');
      expect(tag.className).toContain('px-1.5');
      expect(tag.className).toContain('py-0.5');
    });
    act(() => root.unmount());
    container.remove();
  });

  it('always limits specialty tags to two', () => {
    const { container, root } = setup({ specialties: ['x', 'y', 'z'] });
    const tagDiv = container.querySelector('div.flex.flex-nowrap');
    expect(tagDiv).not.toBeNull();
    const tags = tagDiv?.querySelectorAll('span');
    expect(tags?.length).toBe(2);

    act(() => root.unmount());
    container.remove();
  });
});
