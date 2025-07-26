import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import BookingRequestCard from '../BookingRequestCard';
import type { BookingRequest, Service } from '@/types';

const baseReq: BookingRequest = {
  id: 1,
  client_id: 2,
  artist_id: 3,
  status: 'pending_quote',
  created_at: '2025-07-18T00:00:00.000Z',
  updated_at: '2025-07-18T00:00:00.000Z',
  client: {
    id: 2,
    email: 'c@example.com',
    user_type: 'client',
    first_name: 'Jane',
    last_name: 'Doe',
    phone_number: '',
    is_active: true,
    is_verified: true,
    profile_picture_url: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
  service: { id: 9, artist_id: 3, title: 'Live Musiek' } as Service,
} as BookingRequest;


describe('BookingRequestCard', () => {
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

  it('applies different badge colors based on status', () => {
    const cases: [string, string][] = [
      ['pending_quote', 'bg-yellow-100'],
      ['pending_artist_confirmation', 'bg-orange-100'],
      ['quote_provided', 'bg-[var(--color-accent)]/10'],
      ['request_confirmed', 'bg-brand-light'],
      ['request_declined', 'bg-red-100'],
    ];
    cases.forEach(([status, expected]) => {
      act(() => {
        root.render(
          React.createElement(BookingRequestCard, {
            req: { ...baseReq, status } as BookingRequest,
          }),
        );
      });
      const badge = container.querySelector('span.inline-flex') as HTMLSpanElement;
      expect(badge.className).toContain(expected);
    });
  });
});
