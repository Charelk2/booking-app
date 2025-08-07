import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import ConversationList from '../ConversationList';
import { flushPromises } from '@/test/utils/flush';
import type { ArtistProfile, BookingRequest } from '@/types';

function renderComponent(props: Partial<React.ComponentProps<typeof ConversationList>> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const defaultProps: React.ComponentProps<typeof ConversationList> = {
    bookingRequests: [],
    selectedRequestId: null,
    onSelectRequest: jest.fn(),
    currentUser: null,
  };
  return { container, root, props: { ...defaultProps, ...props } };
}

describe('ConversationList', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('renders nothing when currentUser is null', async () => {
    const { container, root, props } = renderComponent();
    await act(async () => {
      root.render(<ConversationList {...props} />);
    });
    await flushPromises();
    expect(container.children.length).toBe(0);
    act(() => root.unmount());
    container.remove();
  });

  it('displays conversations when user provided', async () => {
    const requests: BookingRequest[] = [
      {
        id: 1,
        client_id: 1,
        artist_id: 2,
        status: 'pending_quote',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        client: { id: 1, email: 'a', user_type: 'client', first_name: 'A', last_name: 'B', phone_number: '', is_active: true, is_verified: true },
        artist: {
          id: 2,
          user: { id: 2, email: 'b', user_type: 'artist', first_name: 'B', last_name: 'C', phone_number: '', is_active: true, is_verified: true },
          profile_picture_url: null,
        } as unknown as BookingRequest['artist'],
        artist_profile: { business_name: 'Biz', profile_picture_url: null } as ArtistProfile,
      } as BookingRequest,
    ];
    const { container, root, props } = renderComponent({
      bookingRequests: requests,
      currentUser: { id: 1, email: 'a', user_type: 'client', first_name: 'A', last_name: 'B', phone_number: '', is_active: true, is_verified: true },
    });
    await act(async () => {
      root.render(<ConversationList {...props} />);
    });
    await flushPromises();
    expect(container.textContent).toContain('Biz');
    act(() => root.unmount());
    container.remove();
  });

  it('falls back to nested user first name when business name missing', async () => {
    const requests: BookingRequest[] = [
      {
        id: 1,
        client_id: 1,
        artist_id: 2,
        status: 'pending_quote',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        client: {
          id: 1,
          email: 'a',
          user_type: 'client',
          first_name: 'A',
          last_name: 'B',
          phone_number: '',
          is_active: true,
          is_verified: true,
        },
        artist: {
          id: 2,
          business_name: undefined,
          user: {
            id: 2,
            email: 'b',
            user_type: 'artist',
            first_name: 'Nested',
            last_name: 'User',
            phone_number: '',
            is_active: true,
            is_verified: true,
          },
        } as unknown as BookingRequest['artist'],
        artist_profile: { business_name: undefined } as ArtistProfile,
      } as BookingRequest,
    ];
    const { container, root, props } = renderComponent({
      bookingRequests: requests,
      currentUser: {
        id: 1,
        email: 'a',
        user_type: 'client',
        first_name: 'A',
        last_name: 'B',
        phone_number: '',
        is_active: true,
        is_verified: true,
      },
    });
    await act(async () => {
      root.render(<ConversationList {...props} />);
    });
    await flushPromises();
    expect(container.textContent).toContain('Nested');
    act(() => root.unmount());
    container.remove();
  });

  it('shows client-facing quote preview', async () => {
    const requests: BookingRequest[] = [
      {
        id: 1,
        client_id: 1,
        artist_id: 2,
        status: 'pending_quote',
        last_message_content: 'Artist sent a quote',
        last_message_timestamp: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        client: { id: 1, email: 'a', user_type: 'client', first_name: 'A', last_name: 'B', phone_number: '', is_active: true, is_verified: true },
        artist: {
          id: 2,
          user: { id: 2, email: 'b', user_type: 'artist', first_name: 'B', last_name: 'C', phone_number: '', is_active: true, is_verified: true },
          profile_picture_url: null,
        } as unknown as BookingRequest['artist'],
        artist_profile: { business_name: 'Biz', profile_picture_url: null } as ArtistProfile,
      } as BookingRequest,
    ];
    const { container, root, props } = renderComponent({
      bookingRequests: requests,
      currentUser: { id: 1, email: 'a', user_type: 'client', first_name: 'A', last_name: 'B', phone_number: '', is_active: true, is_verified: true },
    });
    await act(async () => {
      root.render(<ConversationList {...props} />);
    });
    await flushPromises();
    expect(container.textContent).toContain('Biz sent a quote');
    act(() => root.unmount());
    container.remove();
  });

  it('shows artist-facing quote preview', async () => {
    const requests: BookingRequest[] = [
      {
        id: 1,
        client_id: 2,
        artist_id: 1,
        status: 'pending_quote',
        last_message_content: 'Artist sent a quote',
        last_message_timestamp: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        client: { id: 2, email: 'b', user_type: 'client', first_name: 'Client', last_name: 'X', phone_number: '', is_active: true, is_verified: true },
        artist: { id: 1, email: 'a', user_type: 'artist', first_name: 'Art', last_name: 'Ist', phone_number: '', is_active: true, is_verified: true },
        artist_profile: { business_name: 'Biz', profile_picture_url: null } as ArtistProfile,
      } as BookingRequest,
    ];
    const { container, root, props } = renderComponent({
      bookingRequests: requests,
      currentUser: { id: 1, email: 'a', user_type: 'artist', first_name: 'Art', last_name: 'Ist', phone_number: '', is_active: true, is_verified: true },
    });
    await act(async () => {
      root.render(<ConversationList {...props} />);
    });
    await flushPromises();
    expect(container.textContent).toContain('You sent a quote');
    act(() => root.unmount());
    container.remove();
  });

  it('uses artist profile picture when artist_profile missing', async () => {
    const requests: BookingRequest[] = [
      {
        id: 1,
        client_id: 1,
        artist_id: 2,
        status: 'pending_quote',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        client: {
          id: 1,
          email: 'a',
          user_type: 'client',
          first_name: 'A',
          last_name: 'B',
          phone_number: '',
          is_active: true,
          is_verified: true,
        },
        artist: {
          id: 2,
          business_name: 'Biz',
          profile_picture_url: '/pic.jpg',
          user: {
            id: 2,
            email: 'b',
            user_type: 'artist',
            first_name: 'B',
            last_name: 'C',
            phone_number: '',
            is_active: true,
            is_verified: true,
          },
        } as unknown as BookingRequest['artist'],
      } as BookingRequest,
    ];
    const { container, root, props } = renderComponent({
      bookingRequests: requests,
      currentUser: {
        id: 1,
        email: 'a',
        user_type: 'client',
        first_name: 'A',
        last_name: 'B',
        phone_number: '',
        is_active: true,
        is_verified: true,
      },
    });
    await act(async () => {
      root.render(<ConversationList {...props} />);
    });
    await flushPromises();
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src') ?? '').toContain('pic.jpg');
    act(() => root.unmount());
    container.remove();
  });
});
