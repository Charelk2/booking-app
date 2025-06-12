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

  it('renders price and location when provided', () => {
    const { container, root } = setup({ price: '$100', location: 'NYC' });
    expect(container.textContent).toContain('$100');
    expect(container.textContent).toContain('NYC');
    act(() => root.unmount());
    container.remove();
  });

  it('shows verified badge and availability', () => {
    const { container, root } = setup({ verified: true, isAvailable: false });
    expect(container.textContent).toContain('Verified');
    expect(container.textContent).toContain('Unavailable');
    act(() => root.unmount());
    container.remove();
  });
});
