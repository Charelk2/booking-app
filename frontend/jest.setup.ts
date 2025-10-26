// Enable React 18 act() environment
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React from "react";
import "@/tests/mocks/no-network";
import {
  useRouter as mockUseRouter,
  usePathname as mockUsePathname,
  useParams as mockUseParams,
  useSearchParams as mockUseSearchParams,
} from "@/tests/mocks/next-navigation";

// Provide a basic matchMedia stub for hooks that query media features.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }),
});

jest.mock('next/navigation', () => ({
  __esModule: true,
  useRouter: mockUseRouter,
  usePathname: mockUsePathname,
  useParams: mockUseParams,
  useSearchParams: mockUseSearchParams,
  redirect: jest.fn(),
}));

// Simplified <Link> component for tests
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: any) => {
    return require('react').createElement('a', { href }, children);
  },
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    return require('react').createElement('img', props);
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
    artistViewActive: true,
    toggleArtistView: jest.fn(),
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

// JSDOM lacks IntersectionObserver; provide a minimal stub
class IntersectionObserver {
  private readonly cb: (entries: any[]) => void;
  constructor(cb: (entries: any[]) => void) {
    this.cb = cb;
  }
  observe() {
    this.cb([{ isIntersecting: true }]);
  }
  unobserve() {}
  disconnect() {}
}
(window as any).IntersectionObserver =
  window.IntersectionObserver || IntersectionObserver;

// Mock Google Maps components used in tests
jest.mock('@react-google-maps/api', () => {
  const React = require('react');
  return {
    useLoadScript: () => ({ isLoaded: true }),
    GoogleMap: (props: any) => React.createElement('div', props, props.children),
    Marker: () => React.createElement('div'),
  };
});


// Stub Google Maps objects used across tests
const mockAutocomplete = jest.fn(function Autocomplete(this: any) {
  this.getPlace = jest.fn();
  this.addListener = jest.fn((evt: string, cb: () => void) => {
    if (evt === 'place_changed') this._cb = cb;
  });
});
const mockAutocompleteService = jest.fn(function AutocompleteService(this: any) {
  this.getPlacePredictions = jest.fn();
});
const mockPlacesService = jest.fn(function PlacesService(this: any) {
  this.getDetails = jest.fn();
});
(globalThis as any).google = {
  maps: {
    LatLng: function LatLng(lat: number, lng: number) {
      return { lat: () => lat, lng: () => lng } as any;
    },
    places: {
      Autocomplete: mockAutocomplete,
      AutocompleteService: mockAutocompleteService,
      PlacesService: mockPlacesService,
      PlacesServiceStatus: { OK: 'OK' },
      AutocompleteSessionToken: jest.fn(),
    },
  },
};
(globalThis as any).mockAutocomplete = mockAutocomplete;
(globalThis as any).mockAutocompleteService = mockAutocompleteService;
(globalThis as any).mockPlacesService = mockPlacesService;

// Stub gmpx-place-autocomplete web component used in LocationMapModal
class GmpxPlaceAutocomplete extends HTMLElement {
  value: any = null;
}
if (!customElements.get('gmpx-place-autocomplete')) {
  customElements.define('gmpx-place-autocomplete', GmpxPlaceAutocomplete);
}

// Additional browser stubs
(window as any).confirm = jest.fn(() => true);
(window as any).URL.createObjectURL = jest.fn(() => 'blob:');
Object.defineProperty(window, 'location', {
  value: { ...window.location, assign: jest.fn() },
  writable: true,
});
