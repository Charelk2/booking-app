import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import SocialLoginButtons from '../SocialLoginButtons';

describe('SocialLoginButtons redirect handling', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const originalLocation = window.location;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    // jsdom location is read-only so redefine
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });
    process.env.NEXT_PUBLIC_API_URL = 'http://api';
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    window.location = originalLocation;
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_APPLE_SIGNIN;
  });

  it('defaults to /dashboard', () => {
    act(() => {
      root.render(<SocialLoginButtons />);
    });
    const googleBtn = container.querySelector('button') as HTMLButtonElement;
    act(() => {
      googleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(window.location.href).toBe(
      'http://api/auth/google/login?next=%2Fdashboard',
    );
  });

  it('accepts custom redirectPath', () => {
    act(() => {
      root.render(<SocialLoginButtons redirectPath="/profile" />);
    });
    const buttons = container.querySelectorAll('button');
    const googleBtn = buttons[0] as HTMLButtonElement;
    act(() => {
      googleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(window.location.href).toBe(
      'http://api/auth/google/login?next=%2Fprofile',
    );
  });
});
