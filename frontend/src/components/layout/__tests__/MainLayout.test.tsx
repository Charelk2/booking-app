import { flushPromises } from "@/test/utils/flush";
import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import MainLayout from '../MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import type { User } from '@/types';
import { usePathname, useRouter, useSearchParams, useParams } from '@/tests/mocks/next-navigation';

jest.mock('@/contexts/AuthContext');
jest.mock('next/link', () => ({ __esModule: true, default: (props: Record<string, unknown>) => <a {...props} /> }));


describe('MainLayout header behavior', () => {
  afterEach(() => {
    jest.clearAllMocks();
    usePathname.mockReturnValue('/');
    useParams.mockReturnValue({});
    useSearchParams.mockReturnValue(new URLSearchParams());
  });

  it('hides search bar on artist detail pages', async () => {
    usePathname.mockReturnValue('/service-providers/123');
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 2, email: 'a@test.com', user_type: 'service_provider' } as User, logout: jest.fn() });
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

  it('keeps header expanded in artist view', async () => {
      usePathname.mockReturnValue('/service-providers');
    (useAuth as jest.Mock).mockReturnValue({
      user: { id: 10, email: 'artist@test.com', user_type: 'service_provider' } as User,
      logout: jest.fn(),
      artistViewActive: true,
    });
    Object.defineProperty(window, 'scrollY', { writable: true, configurable: true, value: 0 });
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(React.createElement(MainLayout, null, React.createElement('div')));
    });
    await flushPromises();
    const header = div.querySelector('#app-header') as HTMLElement;
    expect(header.getAttribute('data-header-state')).toBe('initial');
    await act(async () => {
      window.scrollY = 100;
      window.dispatchEvent(new Event('scroll'));
    });
    await flushPromises();
    expect(header.getAttribute('data-header-state')).toBe('initial');
    window.scrollY = 0;
    act(() => { root.unmount(); });
    div.remove();
  });

  it('keeps search pill available on artists listing page', async () => {
      usePathname.mockReturnValue('/service-providers');
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

  it('shows search pill on category pages', async () => {
      usePathname.mockReturnValue('/category/dj');
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 11, email: 'cat@test.com', user_type: 'client' } as User, logout: jest.fn() });
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(React.createElement(MainLayout, null, React.createElement('div')));
    });
    await flushPromises();
    expect(div.querySelector('#compact-search-trigger')).toBeTruthy();
    act(() => { root.unmount(); });
    div.remove();
  });

  it('expands search bar when compact pill is clicked on artists listing page', async () => {
      usePathname.mockReturnValue('/service-providers');
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
      usePathname.mockReturnValue('/service-providers');
    useSearchParams.mockReturnValue(new URLSearchParams('category=Live%20Performance'));
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
      usePathname.mockReturnValue('/service-providers');
    useSearchParams.mockReturnValue(
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
    usePathname.mockReturnValue('/contact');
    useParams.mockReturnValue({});
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

  it('applies mobile nav height variable to main padding', async () => {
    usePathname.mockReturnValue('/');
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 9, email: 'h@test.com', user_type: 'client' } as User, logout: jest.fn() });
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(React.createElement(MainLayout, null, React.createElement('div')));
    });
    await flushPromises();
    const main = div.querySelector('main') as HTMLElement;
    expect(main.style.paddingBottom).toBe('var(--mobile-bottom-nav-height, 0px)');
    act(() => { root.unmount(); });
    div.remove();
  });

  it('omits footer when hideFooter is true', async () => {
    usePathname.mockReturnValue('/');
    (useAuth as jest.Mock).mockReturnValue({ user: null, logout: jest.fn() });
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(React.createElement(MainLayout, { hideFooter: true }, React.createElement('div')));
    });
    await flushPromises();
    expect(div.querySelector('footer')).toBeNull();
    act(() => { root.unmount(); });
    div.remove();
  });
});
