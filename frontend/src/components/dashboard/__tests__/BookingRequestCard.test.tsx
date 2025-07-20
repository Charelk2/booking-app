import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import BookingRequestCard from '../BookingRequestCard';
import type { BookingRequest, User, Service } from '@/types';

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
    profile_photo_url: null,
  } as any,
  service: { id: 9, artist_id: 3, title: 'Live Musiek' } as Service,
} as BookingRequest;

const artistUser: User = {
  id: 3,
  email: 'a@example.com',
  user_type: 'artist',
  first_name: 'Art',
  last_name: 'Ist',
  phone_number: '',
  is_active: true,
  is_verified: true,
};

const clientUser: User = { ...artistUser, user_type: 'client' };

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

  it('calls onUpdate when update button clicked', () => {
    const onUpdate = jest.fn();
    act(() => {
      root.render(
        React.createElement(BookingRequestCard, {
          req: baseReq,
          user: artistUser,
          onUpdate,
        }),
      );
    });
    const btn = container.querySelector('button');
    expect(btn).not.toBeNull();
    act(() => {
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onUpdate).toHaveBeenCalled();
  });

  it('hides update button for client user', () => {
    act(() => {
      root.render(
        React.createElement(BookingRequestCard, {
          req: baseReq,
          user: clientUser,
          onUpdate: jest.fn(),
        }),
      );
    });
    const btn = container.querySelector('button');
    expect(btn).toBeNull();
  });

  it('shows formatted date and chat link', () => {
    act(() => {
      root.render(
        React.createElement(BookingRequestCard, {
          req: baseReq,
          user: artistUser,
          onUpdate: jest.fn(),
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
          user: artistUser,
          onUpdate: jest.fn(),
        }),
      );
    });
    const img = container.querySelector('img');
    expect(img).toBeNull();
  });
});
