import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import { BookingRequestCard } from '..';
import type { BookingRequest, Service, User, ServiceProviderProfile } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('@/contexts/AuthContext');

const client: User = {
  id: 2,
  email: 'c@example.com',
  user_type: 'client',
  first_name: 'Jane',
  last_name: 'Doe',
  phone_number: '',
  is_active: true,
  is_verified: true,
  profile_picture_url: null,
};

const artist: User = {
  id: 3,
  email: 'a@band.com',
  user_type: 'service_provider',
  first_name: 'Band',
  last_name: 'Leader',
  phone_number: '',
  is_active: true,
  is_verified: true,
  profile_picture_url: null,
};

const artistProfile: ServiceProviderProfile = {
  id: 3,
  user_id: 3,
  business_name: 'The Band',
  profile_picture_url: null,
  user: artist,
  created_at: '2025-07-18T00:00:00.000Z',
  updated_at: '2025-07-18T00:00:00.000Z',
};

const service: Service = {
  id: 9,
  artist_id: 3,
  title: 'Live Musiek',
  description: '',
  media_url: 'img.jpg',
  service_type: 'Other',
  duration_minutes: 0,
  travel_rate: undefined,
  travel_members: undefined,
  car_rental_price: undefined,
  flight_price: undefined,
  display_order: 0,
  price: 0,
  artist: artistProfile,
};

const baseReq: BookingRequest = {
  id: 1,
  client_id: 2,
  artist_id: 3,
  status: 'pending_quote',
  created_at: '2025-07-18T00:00:00.000Z',
  updated_at: '2025-07-18T00:00:00.000Z',
  client,
  artist,
  artist_profile: artistProfile,
  service,
};


describe('BookingRequestCard', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    (useAuth as jest.Mock).mockReturnValue({ user: { user_type: 'service_provider' } });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders manage link with correct href', () => {
    act(() => {
      root.render(React.createElement(BookingRequestCard, { req: baseReq }));
    });
    const link = container.querySelector('a') as HTMLAnchorElement | null;
    expect(link?.getAttribute('href')).toBe('/booking-requests/1');
  });

  it('shows formatted date and manage link', () => {
    act(() => {
      root.render(
        React.createElement(BookingRequestCard, {
          req: baseReq,
        }),
      );
    });
    expect(container.textContent).toContain('18 Jul 2025');
    const link = container.querySelector('a') as HTMLAnchorElement | null;
    expect(link?.getAttribute('href')).toBe('/booking-requests/1');
  });

  it('shows initials when no avatar provided', () => {
    act(() => {
      root.render(
        React.createElement(BookingRequestCard, {
          req: baseReq,
        }),
      );
    });
    const img = container.querySelector('img');
    expect(img).toBeNull();
  });

  it('shows artist business name to client users', () => {
    (useAuth as jest.Mock).mockReturnValue({ user: { user_type: 'client' } });
    act(() => {
      root.render(React.createElement(BookingRequestCard, { req: baseReq }));
    });
    expect(container.textContent).toContain('The Band');
  });

  it('applies status badge classes based on status', () => {
    const cases: [string, string][] = [
      ['pending_quote', 'status-badge-pending-quote'],
      ['pending_artist_confirmation', 'status-badge-pending-action'],
      ['quote_provided', 'status-badge-quote-provided'],
      ['request_confirmed', 'status-badge-confirmed'],
      ['request_declined', 'status-badge-declined'],
    ];
    cases.forEach(([status, expected]) => {
      act(() => {
        root.render(
          React.createElement(BookingRequestCard, {
            req: { ...baseReq, status } as BookingRequest,
          }),
        );
      });
      const badge = container.querySelector('span[class*="status-badge"]') as HTMLSpanElement;
      expect(badge?.className).toContain(expected);
    });
  });
});
