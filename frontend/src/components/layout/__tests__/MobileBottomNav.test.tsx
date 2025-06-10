import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import MobileBottomNav from '../MobileBottomNav';
import type { User } from '@/types';

const mockUseRouter = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => mockUseRouter(),
  usePathname: () => '/',
}));

jest.mock('../../../hooks/useNotifications', () => ({
  __esModule: true,
  default: () => ({ threads: [{ unread_count: 3 }] }),
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
    mockUseRouter.mockReturnValue({ pathname: '/' });
    act(() => {
      root.render(
        React.createElement(MobileBottomNav, { user: null })
      );
    });
    expect(container.innerHTML).toBe('');
  });

  it('renders navigation links when logged in', () => {
    mockUseRouter.mockReturnValue({ pathname: '/' });
    act(() => {
      root.render(
        React.createElement(MobileBottomNav, { user: {} as User })
      );
    });
    expect(container.textContent).toContain('Home');
    expect(container.textContent).toContain('Artists');
  });

  it('shows unread message count badge', () => {
    mockUseRouter.mockReturnValue({ pathname: '/' });
    act(() => {
      root.render(
        React.createElement(MobileBottomNav, { user: {} as User })
      );
    });
    const badge = container.querySelector('span[class*=bg-red-600]');
    expect(badge?.textContent).toBe('3');
  });

  it('highlights the active tab icon', () => {
    mockUseRouter.mockReturnValue({ pathname: '/' });
    act(() => {
      root.render(
        React.createElement(MobileBottomNav, { user: {} as User })
      );
    });
    const activeLink = container.querySelector('a.text-brand-dark');
    expect(activeLink).not.toBeNull();
  });

  it('hides on scroll down and shows on scroll up', () => {
    mockUseRouter.mockReturnValue({ pathname: '/' });
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
    mockUseRouter.mockReturnValue({ pathname: '/' });
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
