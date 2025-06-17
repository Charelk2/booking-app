// Enable React 18 act() environment
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React from "react";

jest.mock('next/navigation', () => {
  return {
    useRouter: () => ({
      push: jest.fn(),
      replace: jest.fn(),
      refresh: jest.fn(),
      pathname: '/',
    }),
    usePathname: () => '/',
    useParams: jest.fn(() => ({})),
  };
});

// Simplified <Link> component for tests
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: any) => {
    return require('react').createElement('a', { href }, children);
  },
}));

jest.mock('@/contexts/AuthContext', () => {
  const mock = jest.fn(() => ({
    user: null,
    token: null,
    loading: false,
    login: jest.fn(),
    verifyMfa: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
  }));
  return { useAuth: mock };
});

// JSDOM lacks ResizeObserver; provide a minimal stub
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(window as any).ResizeObserver = window.ResizeObserver || ResizeObserver;

// Mock Google Maps components used in tests
jest.mock('@react-google-maps/api', () => {
  const React = require('react');
  return {
    useLoadScript: () => ({ isLoaded: true }),
    GoogleMap: (props: any) => React.createElement('div', props, props.children),
    Marker: () => React.createElement('div'),
  };
});


// Stub Places Autocomplete used by LocationStep
const mockAutocomplete = jest.fn(function Autocomplete(this: any) {
  this.getPlace = jest.fn();
  this.addListener = jest.fn((evt: string, cb: () => void) => {
    if (evt === 'place_changed') this._cb = cb;
  });
});
(globalThis as any).google = {
  maps: {
    places: {
      Autocomplete: mockAutocomplete,
    },
  },
};
(globalThis as any).mockAutocomplete = mockAutocomplete;

