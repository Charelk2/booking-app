import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import MessageThread from '../MessageThread';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

function flushPromises() {
  return new Promise((res) => setTimeout(res, 0));
}

describe('MessageThread basic rendering', () => {
  beforeEach(() => {
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({ data: [] });
    (api.getQuoteV2 as jest.Mock).mockResolvedValue({ data: { id: 1 } });
    (api.acceptQuoteV2 as jest.Mock).mockResolvedValue({ data: { id: 1 } });
    (api.getBookingDetails as jest.Mock).mockResolvedValue({
      data: { id: 1, service: { title: 'Gig' }, start_time: '2024-01-01T00:00:00Z' },
    });
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: 'client', email: 'c@example.com' } });
  });

  it('renders without crashing', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MessageThread
          bookingRequestId={1}
          showQuoteModal={false}
          setShowQuoteModal={jest.fn()}
        />,
      );
    });
    await act(async () => { await flushPromises(); });
    expect(container.querySelector('form')).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });
});

describe('MessageThread booking details', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: 'client' } });
    (api.getQuoteV2 as jest.Mock).mockResolvedValue({ data: { id: 1 } });
    (api.acceptQuoteV2 as jest.Mock).mockResolvedValue({ data: { id: 1 } });
    (api.getBookingDetails as jest.Mock).mockResolvedValue({
      data: { id: 1, service: { title: 'Gig' }, start_time: '2024-01-01T00:00:00Z' },
    });
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 1,
          sender_type: 'client',
          content:
            'Booking details:\nEvent Type: Wedding\nDate: 2024-01-01\nLocation: Cape Town',
          message_type: 'system',
          is_read: true,
          timestamp: '2024-01-01T00:00:00Z',
        },
      ],
    });
  });

  it('renders booking details bubble', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MessageThread
          bookingRequestId={1}
          showQuoteModal={false}
          setShowQuoteModal={jest.fn()}
        />,
      );
    });
    await act(async () => { await flushPromises(); });
    expect(container.textContent).toContain('Booking Details');
    expect(container.textContent).toContain('Event Type: Wedding');
    expect(container.textContent).toContain('Location: Cape Town');
    act(() => root.unmount());
    container.remove();
  });
});

describe('MessageThread system CTAs', () => {
  beforeEach(() => {
    (api.getQuoteV2 as jest.Mock).mockResolvedValue({
      data: {
        id: 42,
        services: [{ description: 'Gig', price: 100 }],
        sound_fee: 0,
        travel_fee: 0,
        discount: 0,
        subtotal: 100,
        total: 100,
        status: 'pending',
      },
    });
    (api.acceptQuoteV2 as jest.Mock).mockResolvedValue({ data: { id: 1 } });
    (api.getBookingDetails as jest.Mock).mockResolvedValue({
      data: { id: 99, service: { title: 'Gig' }, start_time: '2024-01-01T00:00:00Z' },
    });
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
  });

  it('shows Review & Send Quote for artists', async () => {
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 5, user_type: 'artist' } });
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 5,
          sender_type: 'artist',
          content: 'Review & Send Quote',
          message_type: 'system',
          visible_to: 'artist',
          action: 'review_quote',
          is_read: true,
          timestamp: '2024-01-01T00:00:00Z',
        },
      ],
    });

    const container = document.createElement('div');
    const root = createRoot(container);
    const setShowQuoteModal = jest.fn();
    await act(async () => {
      root.render(
        <MessageThread
          bookingRequestId={1}
          showQuoteModal={false}
          setShowQuoteModal={setShowQuoteModal}
        />,
      );
    });
    await act(async () => { await flushPromises(); });

    const button = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Review & Send Quote',
    );
    expect(button).not.toBeNull();
    act(() => { button?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(setShowQuoteModal).toHaveBeenCalledWith(true);

    act(() => root.unmount());
    container.remove();
  });

  it('shows Review & Accept Quote for clients with countdown and opens modal', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-01T00:00:00Z'));

    (useAuth as jest.Mock).mockReturnValue({ user: { id: 7, user_type: 'client' } });
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 9,
          sender_type: 'artist',
          content: 'Review & Accept Quote',
          message_type: 'system',
          visible_to: 'client',
          action: 'review_quote',
          quote_id: 42,
          expires_at: new Date('2025-01-01T00:05:00Z').toISOString(),
          is_read: true,
          timestamp: '2025-01-01T00:00:00Z',
        },
        {
          id: 2,
          booking_request_id: 1,
          sender_id: 9,
          sender_type: 'artist',
          content: 'Quote message',
          message_type: 'quote',
          quote_id: 42,
          is_read: true,
          timestamp: '2025-01-01T00:00:00Z',
        },
      ],
    });

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MessageThread
          bookingRequestId={1}
          showQuoteModal={false}
          setShowQuoteModal={jest.fn()}
        />,
      );
    });
    await act(async () => { await flushPromises(); });

    const countdown = container.querySelector('[data-testid="countdown"]');
    expect(countdown?.textContent).toContain('5m');

    const button = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Review & Accept Quote',
    );
    expect(button).not.toBeNull();

    (api.getQuoteV2 as jest.Mock).mockResolvedValue({
      data: {
        id: 42,
        booking_request_id: 1,
        artist_id: 9,
        client_id: 7,
        services: [{ description: 'Performance', price: 100 }],
        sound_fee: 0,
        travel_fee: 0,
        subtotal: 100,
        total: 100,
        status: 'pending',
        created_at: '',
        updated_at: '',
      },
    });

    act(() => { button?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { await flushPromises(); });
    expect(api.getQuoteV2).toHaveBeenCalledWith(42);
    expect(container.textContent).toContain('Quote Review');

    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
  });

  it('navigates when View Booking Details is clicked', async () => {
    const push = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push });
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 3, user_type: 'client' } });
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 3,
          sender_type: 'client',
          content: 'View Booking Details',
          message_type: 'system',
          visible_to: 'client',
          action: 'view_booking_details',
          is_read: true,
          timestamp: '2024-01-01T00:00:00Z',
        },
      ],
    });

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MessageThread
          bookingRequestId={1}
          showQuoteModal={false}
          setShowQuoteModal={jest.fn()}
        />,
      );
    });
    await act(async () => { await flushPromises(); });

    const button = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'View Booking Details',
    );
    expect(button).not.toBeNull();
    act(() => { button?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(push).toHaveBeenCalledWith('/dashboard/client/bookings/99');

    act(() => root.unmount());
    container.remove();
  });
});
