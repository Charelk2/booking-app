import { flushPromises } from "@/test/utils/flush";
import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import MainLayout from '../MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import type { User } from '@/types';

jest.mock('@/contexts/AuthContext');
jest.mock('next/link', () => ({ __esModule: true, default: (props: Record<string, unknown>) => <a {...props} /> }));
const mockUsePathname = jest.fn(() => '/');
const mockUseParams = jest.fn(() => ({}));
const mockUseSearchParams = jest.fn(() => new URLSearchParams());
const mockUseRouter = jest.fn(() => ({}));

jest.mock('next/navigation', () => ({
  ...jest.requireActual('next/navigation'),
  usePathname: () => mockUsePathname(),
  useRouter: () => mockUseRouter(),
  useSearchParams: () => mockUseSearchParams(),
  useParams: () => mockUseParams(),
}));


describe('MainLayout user menu', () => {
  afterEach(() => {
    jest.clearAllMocks();
    mockUsePathname.mockReturnValue('/');
    mockUseParams.mockReturnValue({});
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
  });

  it('shows artist links for artist users', async () => {
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 1, email: 'a@test.com', user_type: 'artist' } as User, logout: jest.fn() });
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(React.createElement(MainLayout, null, React.createElement('div')));
    });
    await flushPromises();
    expect(div.textContent).toContain('Sound Providers');
    expect(div.textContent).toContain('Quote Calculator');
    expect(div.textContent).toContain('Quote Templates');
    const menuBtn = Array.from(div.querySelectorAll('button')).find(b => b.textContent?.includes('Open user menu')) as HTMLButtonElement;
    expect(menuBtn).toBeTruthy();
    await act(async () => {
      menuBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();
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
    await flushPromises();
    const menuBtn = Array.from(div.querySelectorAll('button')).find(b => b.textContent?.includes('Open user menu')) as HTMLButtonElement;
    expect(menuBtn).toBeTruthy();
    await act(async () => {
      menuBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();
    expect(div.textContent).toContain('My Bookings');
    expect(div.textContent).toContain('Account');
    act(() => { root.unmount(); });
    div.remove();
  });

  it('renders compact search pill on artist detail pages', async () => {
    mockUsePathname.mockReturnValue('/artists');
    mockUseParams.mockReturnValue({ id: '123' });
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 2, email: 'a@test.com', user_type: 'artist' } as User, logout: jest.fn() });
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(React.createElement(MainLayout, null, React.createElement('div')));
    });
    await flushPromises();
    const header = div.querySelector('#app-header') as HTMLElement;
    expect(header).toBeTruthy();
    expect(header.getAttribute('data-header-state')).toBe('compacted');
    expect(div.querySelector('#compact-search-trigger')).toBeTruthy();
    act(() => { root.unmount(); });
    div.remove();
  });

  it('expands search bar when compact pill is clicked on artist detail pages', async () => {
    mockUsePathname.mockReturnValue('/artists');
    mockUseParams.mockReturnValue({ id: '999' });
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 9, email: 'x@test.com', user_type: 'artist' } as User, logout: jest.fn() });
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(React.createElement(MainLayout, null, React.createElement('div')));
    });
    await flushPromises();
    const trigger = div.querySelector('#compact-search-trigger') as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();
    const header = div.querySelector('#app-header') as HTMLElement;
    expect(header.getAttribute('data-header-state')).toBe('expanded-from-compact');
    expect(div.querySelector('.header-full-search-bar')).toBeTruthy();
    act(() => { root.unmount(); });
    div.remove();
  });

  it('keeps search pill available on artists listing page', async () => {
    mockUsePathname.mockReturnValue('/artists');
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 3, email: 'c@test.com', user_type: 'client' } as User, logout: jest.fn() });
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(React.createElement(MainLayout, null, React.createElement('div')));
    });
    await flushPromises();
    expect(div.querySelector('#compact-search-trigger')).toBeTruthy();
    expect(div.querySelector('.header-full-search-bar')).toBeNull();
    act(() => { root.unmount(); });
    div.remove();
  });

  it('renders compact search pill on the home page', async () => {
    mockUsePathname.mockReturnValue('/');
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 11, email: 'h@test.com', user_type: 'client' } as User, logout: jest.fn() });
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(React.createElement(MainLayout, null, React.createElement('div')));
    });
    await flushPromises();
    const header = div.querySelector('#app-header') as HTMLElement;
    expect(header.getAttribute('data-header-state')).toBe('compacted');
    expect(div.querySelector('#compact-search-trigger')).toBeTruthy();
    act(() => { root.unmount(); });
    div.remove();
  });

  it('initializes compact header when search params present', async () => {
    mockUsePathname.mockReturnValue('/artists');
    mockUseSearchParams.mockReturnValue(new URLSearchParams('category=Live%20Performance'));
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 7, email: 'q@test.com', user_type: 'client' } as User, logout: jest.fn() });
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(React.createElement(MainLayout, null, React.createElement('div')));
    });
    await flushPromises();
    const header = div.querySelector('#app-header') as HTMLElement;
    expect(header.getAttribute('data-header-state')).toBe('compacted');
    act(() => { root.unmount(); });
    div.remove();
  });

  it('hides search bar outside home and artists pages', async () => {
    mockUsePathname.mockReturnValue('/contact');
    mockUseParams.mockReturnValue({});
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 4, email: 'd@test.com', user_type: 'client' } as User, logout: jest.fn() });
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(React.createElement(MainLayout, null, React.createElement('div')));
    });
    await flushPromises();
    expect(div.querySelector('#compact-search-trigger')).toBeNull();
    expect(div.querySelector('.header-full-search-bar')).toBeNull();
    act(() => { root.unmount(); });
    div.remove();
  });
});
