import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import MobileBottomNav from '../MobileBottomNav';

describe('MobileBottomNav', () => {
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

  it('renders navigation links', () => {
    act(() => {
      root.render(
        React.createElement(MobileBottomNav, { user: null, pathname: '/' })
      );
    });
    expect(container.textContent).toContain('Home');
    expect(container.textContent).toContain('Artists');
  });

  it('hides auth-only links when not logged in', () => {
    act(() => {
      root.render(
        React.createElement(MobileBottomNav, { user: null, pathname: '/' })
      );
    });
    expect(container.textContent).not.toContain('Dashboard');
  });
});
