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
    GoogleMap: (props: any) => React.createElement('div', props, props.children),
    Marker: () => React.createElement('div'),
  };
});

jest.mock('@googlemaps/places', () => {
  return {
    PlaceAutocompleteElement: function () {
      const doc = (globalThis as any).document;
      return doc ? doc.createElement('input') : {};
    },
  };
});

