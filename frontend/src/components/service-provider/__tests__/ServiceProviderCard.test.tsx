import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import ServiceProviderCard from '../ServiceProviderCard';

function setup(props = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const allProps = {
    serviceProviderId: 1,
    name: 'Test Provider',
    href: '/1',
    ...props,
  };
  act(() => {
    root.render(React.createElement(ServiceProviderCard, allProps));
  });
  return { container, root };
}

describe('ServiceProviderCard optional fields', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
    // Polyfill for matchMedia used in ServiceProviderCard
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

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

  it('shows only the city for location and omits subtitle', () => {
    const fullAddress =
      '123 Main St, Suburb, Worcester, 6850, Western Cape, South Africa';
    const { container, root } = setup({
      location: fullAddress,
      subtitle: 'Best service provider ever in the world',
    });
    expect(container.textContent).toContain('Worcester');
    expect(container.textContent).not.toContain('123 Main St');
    expect(container.textContent).not.toContain('Suburb');
    expect(container.textContent).not.toContain('6850');
    expect(container.textContent).not.toContain('Western Cape');
    expect(container.textContent).not.toContain('Best service provider');
    const locEl = container.querySelector('span.text-sm');
    expect(locEl?.textContent).toBe('Worcester');
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

  it('wraps the image in a link to the service provider profile', () => {
    const { container, root } = setup({ imageUrl: '/a.jpg', href: '/9' });
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    const anchor = img?.closest('a');
    expect(anchor?.getAttribute('href')).toBe('/9');
    act(() => root.unmount());
    container.remove();
  });

  it('shows Book Now button by default on touch devices', () => {
    (window.matchMedia as jest.Mock).mockImplementation((query) => ({
      matches: query === '(hover: none)',
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
    const { container, root } = setup();
    const overlay = container.querySelector('div.absolute.flex');
    expect(overlay?.className).toContain('opacity-100');
    act(() => root.unmount());
    container.remove();
    (window.matchMedia as jest.Mock).mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  });


  it('applies rounded-md class to the action button', () => {
    const { container, root } = setup();
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('rounded-md');
    act(() => root.unmount());
    container.remove();
  });

  it('does not render specialty tags when provided', () => {
    const { container, root } = setup({ specialties: ['a', 'b'] });
    const tagContainer = container.querySelector('div.flex.flex-nowrap');
    expect(tagContainer).toBeNull();
    act(() => root.unmount());
    container.remove();
  });
});
