import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ArtistCardCompact from '../ArtistCardCompact';

function setup(props = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const allProps = {
    id: 1,
    name: 'Test',
    href: '/artists/1',
    ...props,
  };
  return { container, root, allProps };
}

describe('ArtistCardCompact', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('matches snapshot', () => {
    const { container, root, allProps } = setup();
    act(() => {
      root.render(React.createElement(ArtistCardCompact, allProps));
    });
    expect(container.firstChild).toMatchSnapshot();
    act(() => root.unmount());
    container.remove();
  });
});
