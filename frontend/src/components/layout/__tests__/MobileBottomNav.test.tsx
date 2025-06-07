import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import MobileBottomNav from '../MobileBottomNav';
import type { User } from '@/types';

const mockUseRouter = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => mockUseRouter(),
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
    root.unmount();
    container.remove();
  });

  it('renders navigation links', () => {
    mockUseRouter.mockReturnValue({ pathname: '/' });
    act(() => {
      root.render(
        React.createElement(MobileBottomNav, { user: null })
      );
    });
    expect(container.textContent).toContain('Home');
    expect(container.textContent).toContain('Artists');
  });

  it('hides auth-only links when not logged in', () => {
    mockUseRouter.mockReturnValue({ pathname: '/' });
    act(() => {
      root.render(
        React.createElement(MobileBottomNav, { user: null })
      );
    });
    expect(container.textContent).not.toContain('Dashboard');
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
        React.createElement(MobileBottomNav, { user: null })
      );
    });
    const activeLink = container.querySelector('a.text-indigo-600');
    expect(activeLink).not.toBeNull();
  });
});
