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
  };
});

jest.mock('@/contexts/AuthContext', () => {
  const mock = jest.fn(() => ({
    user: null,
    token: null,
    loading: false,
    login: jest.fn(),
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
    GoogleMap: (props: any) => React.createElement('div', null, props.children),
    Marker: () => React.createElement('div'),
    Autocomplete: (props: any) => React.createElement('div', null, props.children),
  };
});
