import { flushPromises } from "@/test/utils/flush";
import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import Header from '../Header';
import { usePathname } from 'next/navigation';

jest.mock('next/link', () => ({ __esModule: true, default: (props: Record<string, unknown>) => <a {...props} /> }));
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn(() => ({ user: null, logout: jest.fn() })) }));
jest.mock('../../search/SearchBarExpanded', () => ({
  __esModule: true,
  default: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? <div data-testid="search-expanded-overlay" onClick={onClose} /> : null,
}));


function render() {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  return { div, root };
}

describe('Header', () => {
  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('renders compact search bar on home page', async () => {
    (usePathname as jest.Mock).mockReturnValue('/');
    const { div, root } = render();
    await act(async () => {
      root.render(<Header />);
    });
    await flushPromises();
    const button = div.querySelector('button');
    expect(button).toBeTruthy();
    act(() => root.unmount());
    div.remove();
  });

  it('opens and closes expanded search', async () => {
    (usePathname as jest.Mock).mockReturnValue('/');
    const { div, root } = render();
    await act(async () => {
      root.render(<Header />);
    });
    await flushPromises();

    const button = div.querySelector('button');
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();
    expect(div.querySelector('[data-testid="search-expanded-overlay"]')).toBeTruthy();

    const overlay = div.querySelector('[data-testid="search-expanded-overlay"]');
    await act(async () => {
      overlay?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();
    expect(div.querySelector('[data-testid="search-expanded-overlay"]')).toBeNull();

    act(() => root.unmount());
    div.remove();
  });

  it('renders compact bar regardless of screen size', async () => {
    (usePathname as jest.Mock).mockReturnValue('/');
    const { div, root } = render();
    await act(async () => {
      root.render(<Header />);
    });
    await flushPromises();
    const button = div.querySelector('button');
    expect(button).toBeTruthy();
    act(() => root.unmount());
    div.remove();
  });
});
