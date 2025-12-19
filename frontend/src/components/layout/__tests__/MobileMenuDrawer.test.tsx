import { flushPromises } from "@/test/utils/flush";
import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import MobileMenuDrawer from '../MobileMenuDrawer';
import type { User } from '@/types';
import {
  HomeIcon,
  UsersIcon,
  DocumentDuplicateIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline';

jest.mock('next/link', () => ({
  __esModule: true,
  default: (props: ComponentPropsWithoutRef<'a'>) => <a {...props} />,
}));


const nav = [
  { name: 'Home', href: '/', icon: HomeIcon },
  { name: 'Service Providers', href: '/service-providers', icon: UsersIcon },
  {
    name: 'Quote Templates',
    href: '/dashboard/profile/quote-templates',
    icon: DocumentDuplicateIcon,
  },
];

describe('MobileMenuDrawer', () => {
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

  it('renders navigation items when open', async () => {
    await act(async () => {
      root.render(
        React.createElement(MobileMenuDrawer, {
          open: true,
          onClose: () => {},
          navigation: nav,
          user: null,
          logout: () => {},
          pathname: '/',
        }),
      );
    });
    await flushPromises();
    const bodyText = document.body.textContent || '';
    expect(bodyText).toContain('Home');
    expect(bodyText).toContain('Service Providers');
    expect(bodyText).toContain('Quote Templates');
  });

  it('renders an icon for each navigation link', async () => {
    await act(async () => {
      root.render(
        React.createElement(MobileMenuDrawer, {
          open: true,
          onClose: () => {},
          navigation: nav,
          secondaryNavigation: [{ name: 'Help', href: '/help', icon: QuestionMarkCircleIcon }],
          user: null,
          logout: () => {},
          pathname: '/',
        }),
      );
    });
    await flushPromises();
    const exploreIcons = document.querySelectorAll('nav[aria-label="Explore"] svg');
    expect(exploreIcons.length).toBe(nav.length);
    const moreIcons = document.querySelectorAll('nav[aria-label="More"] svg');
    expect(moreIcons.length).toBe(1);
  });

  it('close button has focus ring classes', async () => {
    await act(async () => {
      root.render(
        React.createElement(MobileMenuDrawer, {
          open: true,
          onClose: () => {},
          navigation: nav,
          user: null,
          logout: () => {},
          pathname: '/',
        }),
      );
    });
    await flushPromises();
    const button = document.querySelector('button[aria-label="Close menu"]');
    expect(button?.className).toContain('focus-visible:ring-2');
    expect(button?.className).toContain('focus-visible:ring-brand');
  });

  it('navigation links have minimum touch size', async () => {
    await act(async () => {
      root.render(
        React.createElement(MobileMenuDrawer, {
          open: true,
          onClose: () => {},
          navigation: nav,
          user: null,
          logout: () => {},
          pathname: '/',
        }),
      );
    });
    await flushPromises();
    const link = document.querySelector('a');
    expect(link?.className).toContain('min-w-[44px]');
    expect(link?.className).toContain('min-h-[44px]');
  });

  it('uses Dialog.Title and nav lists for structure', async () => {
    await act(async () => {
      root.render(
        React.createElement(MobileMenuDrawer, {
          open: true,
          onClose: () => {},
          navigation: nav,
          secondaryNavigation: [{ name: 'Help', href: '/help' }],
          user: null,
          logout: () => {},
          pathname: '/',
        }),
      );
    });
    await flushPromises();
    const title = document.querySelector(
      'h2[id^="headlessui-dialog-title"]',
    );
    expect(title?.textContent).toBe('Menu');
    const exploreNav = document.querySelector('nav[aria-label="Explore"]');
    expect(exploreNav?.querySelectorAll('ul > li').length).toBe(nav.length);
    const moreNav = document.querySelector('nav[aria-label="More"]');
    expect(moreNav?.querySelectorAll('ul > li').length).toBe(1);
    const accountNav = document.querySelector('nav[aria-label="Account"]');
    expect(accountNav?.querySelectorAll('ul > li').length).toBe(2);
  });

  it('shows artist links for artists', async () => {
    await act(async () => {
      root.render(
        React.createElement(MobileMenuDrawer, {
          open: true,
          onClose: () => {},
          navigation: nav,
          user: { user_type: 'service_provider' } as User,
          logout: () => {},
          pathname: '/',
        }),
      );
    });
    await flushPromises();
    const body = document.body.textContent || '';
    expect(body).toContain('Dashboard');
    expect(body).toContain('Profile');
    // Quotes and templates removed from mobile drawer per request
    expect(body).not.toContain('Quotes');
    expect(body).not.toContain('Quote Templates');
  });

  it('shows Dashboard and Messages links for clients', async () => {
    await act(async () => {
      root.render(
        React.createElement(MobileMenuDrawer, {
          open: true,
          onClose: () => {},
          navigation: nav,
          user: { user_type: 'client' } as User,
          logout: () => {},
          pathname: '/',
        }),
      );
    });
    await flushPromises();
    const body = document.body.textContent || '';
    expect(body).toContain('Dashboard');
    expect(body).toContain('Messages');
  });

  it('deduplicates items across navigation sections', async () => {
    await act(async () => {
      root.render(
        React.createElement(MobileMenuDrawer, {
          open: true,
          onClose: () => {},
          navigation: nav,
          secondaryNavigation: nav,
          user: null,
          logout: () => {},
          pathname: '/',
        }),
      );
    });
    await flushPromises();
    const links = Array.from(document.querySelectorAll('a')).filter(
      (a) => a.textContent === 'Home',
    );
    expect(links).toHaveLength(1);
  });

  it('marks active account link for authenticated users', async () => {
    await act(async () => {
      root.render(
        React.createElement(MobileMenuDrawer, {
          open: true,
          onClose: () => {},
          navigation: nav,
          user: { user_type: 'service_provider' } as User,
          logout: () => {},
          pathname: '/dashboard/artist',
        }),
      );
    });
    await flushPromises();
    const dashboardLink = document.querySelector(
      'a[href="/dashboard/artist"]',
    );
    expect(dashboardLink?.getAttribute('aria-current')).toBe('page');
  });

  it('marks active account link for unauthenticated users', async () => {
    await act(async () => {
      root.render(
        React.createElement(MobileMenuDrawer, {
          open: true,
          onClose: () => {},
          navigation: nav,
          user: null,
          logout: () => {},
          pathname: '/login',
        }),
      );
    });
    await flushPromises();
    const signInLink = document.querySelector('a[href="/login"]');
    expect(signInLink?.getAttribute('aria-current')).toBe('page');
  });

  it('renders artist view toggle for service providers and calls toggleArtistView on click', async () => {
    const toggleArtistView = jest.fn();
    const onClose = jest.fn();

    await act(async () => {
      root.render(
        React.createElement(MobileMenuDrawer, {
          open: true,
          onClose,
          navigation: nav,
          user: { user_type: 'service_provider', first_name: 'Artist', email: 'artist@example.com' } as User,
          logout: () => {},
          pathname: '/',
          artistViewActive: false,
          toggleArtistView,
        }),
      );
    });
    await flushPromises();

    const toggleButton = Array.from(document.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Switch to Hosting' || btn.textContent === 'Switch to Booking',
    );
    expect(toggleButton).toBeTruthy();

    await act(async () => {
      toggleButton && (toggleButton as HTMLButtonElement).click();
    });

    expect(toggleArtistView).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows "List your service" CTA for clients and opens onboarding flow', async () => {
    const onClose = jest.fn();
    const onListYourService = jest.fn();

    await act(async () => {
      root.render(
        React.createElement(MobileMenuDrawer, {
          open: true,
          onClose,
          navigation: nav,
          user: { user_type: 'client', first_name: 'Client', email: 'client@example.com' } as User,
          logout: () => {},
          pathname: '/',
          onListYourService,
        }),
      );
    });
    await flushPromises();

    const listButton = Array.from(document.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'List your service',
    ) as HTMLButtonElement | undefined;

    expect(listButton).toBeTruthy();
    await act(async () => {
      listButton && listButton.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onListYourService).toHaveBeenCalledTimes(1);
  });

  it('shows "List your service" CTA for signed-out users when auth links are visible', async () => {
    const onClose = jest.fn();

    await act(async () => {
      root.render(
        React.createElement(MobileMenuDrawer, {
          open: true,
          onClose,
          navigation: nav,
          user: null,
          logout: () => {},
          pathname: '/',
          hideAuthLinks: false,
        }),
      );
    });
    await flushPromises();

    const listLink = Array.from(document.querySelectorAll('a')).find(
      (a) => a.textContent === 'List your service',
    ) as HTMLAnchorElement | undefined;

    expect(listLink).toBeTruthy();
    expect(listLink?.getAttribute('href')).toBe(
      '/auth?intent=signup&role=service_provider&next=/onboarding/provider',
    );
  });
});
