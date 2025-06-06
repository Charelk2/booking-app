import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import MobileMenuDrawer from '../MobileMenuDrawer';

const nav = [{ name: 'Home', href: '/' }, { name: 'Artists', href: '/artists' }];

describe('MobileMenuDrawer', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it('renders navigation items when open', () => {
    act(() => {
      root.render(
        React.createElement(MobileMenuDrawer, {
          open: true,
          onClose: () => {},
          navigation: nav,
          user: null,
          logout: () => {},
          pathname: '/',
        }),
      );
    });
    expect(container.textContent).toContain('Home');
    expect(container.textContent).toContain('Artists');
  });
});
