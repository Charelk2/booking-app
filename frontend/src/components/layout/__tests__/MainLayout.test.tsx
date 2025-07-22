import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import MainLayout from '../MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import type { User } from '@/types';

jest.mock('@/contexts/AuthContext');
jest.mock('next/link', () => ({ __esModule: true, default: (props: Record<string, unknown>) => <a {...props} /> }));
jest.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

describe('MainLayout user menu', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows artist links for artist users', async () => {
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 1, email: 'a@test.com', user_type: 'artist' } as User, logout: jest.fn() });
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(React.createElement(MainLayout, null, React.createElement('div')));
    });
    await act(async () => { await Promise.resolve(); });
    expect(div.textContent).toContain('Sound Providers');
    expect(div.textContent).toContain('Quote Calculator');
    expect(div.textContent).toContain('Quote Templates');
    const menuBtn = Array.from(div.querySelectorAll('button')).find(b => b.textContent?.includes('Open user menu')) as HTMLButtonElement;
    expect(menuBtn).toBeTruthy();
    await act(async () => {
      menuBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => { await Promise.resolve(); });
    expect(div.textContent).toContain('Quotes');
    expect(div.textContent).toContain('Quote Templates');
    expect(div.textContent).not.toContain('Account');
    act(() => { root.unmount(); });
    div.remove();
  });

  it('shows My Bookings link for client users', async () => {
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 5, email: 'c@test.com', user_type: 'client' } as User, logout: jest.fn() });
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(React.createElement(MainLayout, null, React.createElement('div')));
    });
    await act(async () => { await Promise.resolve(); });
    const menuBtn = Array.from(div.querySelectorAll('button')).find(b => b.textContent?.includes('Open user menu')) as HTMLButtonElement;
    expect(menuBtn).toBeTruthy();
    await act(async () => {
      menuBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => { await Promise.resolve(); });
    expect(div.textContent).toContain('My Bookings');
    expect(div.textContent).toContain('Account');
    act(() => { root.unmount(); });
    div.remove();
  });
});
