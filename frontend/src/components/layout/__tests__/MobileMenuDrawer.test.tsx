import { flushPromises } from "@/test/utils/flush";
import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import MobileMenuDrawer from '../MobileMenuDrawer';
import type { User } from '@/types';


const nav = [
  { name: 'Home', href: '/' },
  { name: 'Artists', href: '/artists' },
  { name: 'Sound Providers', href: '/sound-providers' },
  { name: 'Quote Calculator', href: '/quote-calculator' },
  { name: 'Quote Templates', href: '/dashboard/profile/quote-templates' },
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
    expect(bodyText).toContain('Artists');
    expect(bodyText).toContain('Sound Providers');
    expect(bodyText).toContain('Quote Calculator');
    expect(bodyText).toContain('Quote Templates');
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
    const span = document.querySelector('span.sr-only');
    const button = span?.parentElement as HTMLButtonElement | null;
    expect(button?.className).toContain('focus-visible:ring-2');
    expect(button?.className).toContain('focus-visible:ring-brand');
  });

  it('shows artist links for artists', async () => {
    await act(async () => {
      root.render(
        React.createElement(MobileMenuDrawer, {
          open: true,
          onClose: () => {},
          navigation: nav,
          user: { user_type: 'artist' } as User,
          logout: () => {},
          pathname: '/',
        }),
      );
    });
    await flushPromises();
    const body = document.body.textContent || '';
    expect(body).toContain('Quotes');
    expect(body).toContain('Sound Providers');
    expect(body).toContain('Quote Calculator');
    expect(body).toContain('Quote Templates');
    expect(body).not.toContain('Account');
  });

  it('shows My Bookings link for clients', async () => {
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
    expect(body).toContain('My Bookings');
    expect(body).toContain('Account');
  });
});
