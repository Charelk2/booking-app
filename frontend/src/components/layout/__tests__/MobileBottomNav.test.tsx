import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import MobileBottomNav from '../MobileBottomNav';
import type { User } from '@/types';
import { useRouter } from '@/tests/mocks/next-navigation';

import type { AnchorHTMLAttributes } from 'react';

jest.mock('next/link', () => ({
  __esModule: true,
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));

jest.mock('../../../hooks/useUnreadThreadsCount', () => ({
  __esModule: true,
  default: () => ({ count: 3 }),
}));

describe('MobileBottomNav', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('does not render when not logged in', () => {
    useRouter.mockReturnValue({ pathname: '/' });
    act(() => {
      root.render(
        React.createElement(MobileBottomNav, { user: null })
      );
    });
    expect(container.innerHTML).toBe('');
  });

  it('renders navigation links when logged in', () => {
    useRouter.mockReturnValue({ pathname: '/' });
    act(() => {
      root.render(
        React.createElement(MobileBottomNav, { user: {} as User })
      );
    });
    expect(container.textContent).toContain('Home');
    expect(container.textContent).toContain('Messages');
    expect(container.textContent).toContain('Dashboard');
    const nav = container.querySelector('nav');
    expect(nav).not.toBeNull();
  });

  it('sets CSS variable with nav height on the document root', () => {
    // JSDOM does not compute layout, so mock the nav height for this test.
    const original = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'offsetHeight',
    );
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      value: 56,
    });

    useRouter.mockReturnValue({ pathname: '/' });
    act(() => {
      root.render(
        React.createElement(MobileBottomNav, { user: {} as User })
      );
    });
    const value = document.documentElement.style.getPropertyValue(
      '--mobile-bottom-nav-height',
    );
    expect(value).toBe('56px');

    if (original) {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', original);
    }
  });

  it('shows unread message count badge', () => {
    useRouter.mockReturnValue({ pathname: '/' });
    act(() => {
      root.render(
        React.createElement(MobileBottomNav, { user: {} as User })
      );
    });
    const badge = container.querySelector('span[class*=bg-red-600]');
    expect(badge?.textContent).toBe('3');
  });

  it('highlights the active tab icon', () => {
    useRouter.mockReturnValue({ pathname: '/' });
    act(() => {
      root.render(
        React.createElement(MobileBottomNav, { user: {} as User })
      );
    });
    const activeLink = container.querySelector('a[aria-current="page"]');
    expect(activeLink).not.toBeNull();
  });

  it('nav links meet touch target size', () => {
    useRouter.mockReturnValue({ pathname: '/' });
    act(() => {
      root.render(
        React.createElement(MobileBottomNav, { user: {} as User })
      );
    });
    const link = container.querySelector('a');
    expect(link?.className).toContain('flex');
    expect(link?.className).toContain('h-full');
  });

  it('hides on scroll down and shows on scroll up', () => {
    useRouter.mockReturnValue({ pathname: '/' });
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
    act(() => {
      root.render(React.createElement(MobileBottomNav, { user: {} as User }));
    });
    const nav = container.querySelector('nav');
    expect(nav?.className).toContain('translate-y-0');

    Object.defineProperty(window, 'scrollY', { value: 100, writable: true });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(nav?.className).toContain('translate-y-full');

    Object.defineProperty(window, 'scrollY', { value: 20, writable: true });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(nav?.className).toContain('translate-y-0');
  });

  it('remains visible once scrolled to the top', () => {
    useRouter.mockReturnValue({ pathname: '/' });
    Object.defineProperty(window, 'scrollY', { value: 100, writable: true });
    act(() => {
      root.render(React.createElement(MobileBottomNav, { user: {} as User }));
    });
    const nav = container.querySelector('nav');

    Object.defineProperty(window, 'scrollY', { value: 200, writable: true });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(nav?.className).toContain('translate-y-full');

    Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(nav?.className).toContain('translate-y-0');

    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(nav?.className).toContain('translate-y-0');
  });
});
