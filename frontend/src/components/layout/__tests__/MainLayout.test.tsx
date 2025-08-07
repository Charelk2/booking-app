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


describe('MainLayout header behavior', () => {
  afterEach(() => {
    jest.clearAllMocks();
    mockUsePathname.mockReturnValue('/');
    mockUseParams.mockReturnValue({});
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
  });

  it('shows full search bar on artist detail pages', async () => {
    mockUsePathname.mockReturnValue('/artists/123');
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
    expect(header.getAttribute('data-header-state')).toBe('initial');
    const pillWrapper = div.querySelector('.compact-pill-wrapper') as HTMLElement;
    expect(pillWrapper.className).toContain('opacity-0');
    const fullBar = div.querySelector('.header-full-search-bar') as HTMLElement;
    expect(fullBar.className).not.toContain('opacity-0');
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
    const fullBar = div.querySelector('.header-full-search-bar') as HTMLElement;
    expect(fullBar.className).toContain('opacity-0');
    act(() => { root.unmount(); });
    div.remove();
  });

  it('expands search bar when compact pill is clicked on artists listing page', async () => {
    mockUsePathname.mockReturnValue('/artists');
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 5, email: 'e@test.com', user_type: 'client' } as User, logout: jest.fn() });
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

  it('displays search values and filter control in compact pill on artists page', async () => {
    mockUsePathname.mockReturnValue('/artists');
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('category=Live%20Performance&location=Cape%20Town&when=2025-07-01'),
    );
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 8, email: 't@test.com', user_type: 'client' } as User, logout: jest.fn() });
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(
        React.createElement(
          MainLayout,
          { headerFilter: React.createElement('button', { 'aria-label': 'Filters' }) },
          React.createElement('div'),
        ),
      );
    });
    await flushPromises();
    const trigger = div.querySelector('#compact-search-trigger') as HTMLButtonElement;
    expect(trigger.textContent).toContain('Musician / Band');
    expect(trigger.textContent).toContain('Cape Town');
    expect(trigger.textContent).toContain('Jul 1, 2025');
    expect(div.querySelector('[aria-label="Filters"]')).toBeTruthy();
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
