import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import MainLayout from '../MainLayout';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('@/contexts/AuthContext');
jest.mock('next/link', () => ({ __esModule: true, default: (props: any) => <a {...props} /> }));
jest.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({}) }));

describe('MainLayout user menu', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows Quotes link for artist users', async () => {
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 1, email: 'a@test.com', user_type: 'artist' }, logout: jest.fn() });
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(React.createElement(MainLayout, { children: React.createElement('div') }));
    });
    await act(async () => { await Promise.resolve(); });
    const menuBtn = Array.from(div.querySelectorAll('button')).find(b => b.textContent?.includes('Open user menu')) as HTMLButtonElement;
    expect(menuBtn).toBeTruthy();
    await act(async () => {
      menuBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => { await Promise.resolve(); });
    expect(div.textContent).toContain('Quotes');
    act(() => { root.unmount(); });
    div.remove();
  });
});
