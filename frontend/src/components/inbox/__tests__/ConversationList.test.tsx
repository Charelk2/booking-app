import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import ConversationList from '@/components/chat/MessageThread/ConversationList';
import { flushPromises } from '@/test/utils/flush';
import type { ServiceProviderProfile, BookingRequest } from '@/types';
import { BOOKING_DETAILS_PREFIX } from '@/lib/constants';

function renderComponent(props: Partial<React.ComponentProps<typeof ConversationList>> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const defaultProps: React.ComponentProps<typeof ConversationList> = {
    threads: [],
    selectedThreadId: null,
    onSelect: jest.fn(),
    currentUser: null,
    query: '',
  };
  return { container, root, props: { ...defaultProps, ...props } };
}

describe('ConversationList', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('renders an empty list when no threads provided', async () => {
    const { container, root, props } = renderComponent();
    await act(async () => {
      root.render(<ConversationList {...props} />);
    });
    await flushPromises();
    expect(container.children.length).toBeGreaterThan(0);
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
          user: { id: 2, email: 'b', user_type: 'service_provider', first_name: 'B', last_name: 'C', phone_number: '', is_active: true, is_verified: true },
          profile_picture_url: null,
        } as unknown as BookingRequest['service_provider'],
        artist_profile: { business_name: 'Biz', profile_picture_url: null } as ServiceProviderProfile,
      } as BookingRequest,
    ];
    const { container, root, props } = renderComponent({
      threads: requests,
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
            user_type: 'service_provider',
            first_name: 'Nested',
            last_name: 'User',
            phone_number: '',
            is_active: true,
            is_verified: true,
          },
        } as unknown as BookingRequest['service_provider'],
        artist_profile: { business_name: undefined } as ServiceProviderProfile,
      } as BookingRequest,
    ];
    const { container, root, props } = renderComponent({
      threads: requests,
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
        last_message_content: 'Service Provider sent a quote',
        last_message_timestamp: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        client: { id: 1, email: 'a', user_type: 'client', first_name: 'A', last_name: 'B', phone_number: '', is_active: true, is_verified: true },
        artist: {
          id: 2,
          user: { id: 2, email: 'b', user_type: 'service_provider', first_name: 'B', last_name: 'C', phone_number: '', is_active: true, is_verified: true },
          profile_picture_url: null,
        } as unknown as BookingRequest['service_provider'],
        artist_profile: { business_name: 'Biz', profile_picture_url: null } as ServiceProviderProfile,
      } as BookingRequest,
    ];
    const { container, root, props } = renderComponent({
      threads: requests,
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
        last_message_content: 'Service Provider sent a quote',
        last_message_timestamp: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        client: { id: 2, email: 'b', user_type: 'client', first_name: 'Client', last_name: 'X', phone_number: '', is_active: true, is_verified: true },
        artist: { id: 1, email: 'a', user_type: 'service_provider', first_name: 'Art', last_name: 'Ist', phone_number: '', is_active: true, is_verified: true },
        artist_profile: { business_name: 'Biz', profile_picture_url: null } as ServiceProviderProfile,
      } as BookingRequest,
    ];
    const { container, root, props } = renderComponent({
      threads: requests,
      currentUser: { id: 1, email: 'a', user_type: 'service_provider', first_name: 'Art', last_name: 'Ist', phone_number: '', is_active: true, is_verified: true },
    });
    await act(async () => {
      root.render(<ConversationList {...props} />);
    });
    await flushPromises();
    expect(container.textContent).toContain('You sent a quote');
    act(() => root.unmount());
    container.remove();
  });

  it('uses service provider profile picture when artist_profile missing', async () => {
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
            user_type: 'service_provider',
            first_name: 'B',
            last_name: 'C',
            phone_number: '',
            is_active: true,
            is_verified: true,
          },
        } as unknown as BookingRequest['service_provider'],
      } as BookingRequest,
    ];
    const { container, root, props } = renderComponent({
      threads: requests,
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

  it('collapses booking details summary into a safe preview label', async () => {
    const now = new Date().toISOString();
    const request: BookingRequest = {
      id: 1,
      client_id: 1,
      artist_id: 2,
      status: 'pending_quote' as any,
      created_at: now,
      updated_at: now,
      last_message_content: `${BOOKING_DETAILS_PREFIX}\nDate: 2026-09-16\nLocation: Pretoria`,
      last_message_timestamp: now,
      client: { id: 1, email: 'a', user_type: 'client', first_name: 'A', last_name: 'B', phone_number: '', is_active: true, is_verified: true },
      artist: {
        id: 2,
        user: { id: 2, email: 'b', user_type: 'service_provider', first_name: 'Biz', last_name: 'Z', phone_number: '', is_active: true, is_verified: true },
        profile_picture_url: null,
      } as unknown as BookingRequest['service_provider'],
      artist_profile: { business_name: 'Biz', profile_picture_url: null } as ServiceProviderProfile,
    } as BookingRequest;

    const { container, root, props } = renderComponent({
      threads: [request],
      currentUser: { id: 1, email: 'a', user_type: 'client', first_name: 'A', last_name: 'B', phone_number: '', is_active: true, is_verified: true },
    });

    await act(async () => {
      root.render(<ConversationList {...props} />);
    });
    await flushPromises();

    const text = container.textContent || '';
    expect(text).toContain('New Booking Request');
    expect(text).not.toContain('Booking details:');
    expect(text).not.toContain('Date:');

    act(() => root.unmount());
    container.remove();
  });
});
