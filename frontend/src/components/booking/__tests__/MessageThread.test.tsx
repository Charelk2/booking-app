import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import MessageThread from '../MessageThread';
import * as api from '@/lib/api';
import { useRouter } from '@/tests/mocks/next-navigation';

jest.mock('@/lib/api');
jest.mock('@/hooks/useWebSocket', () => ({
  __esModule: true,
  default: () => ({ send: jest.fn(), onMessage: jest.fn() }),
}));

beforeAll(() => {
  window.HTMLElement.prototype.scrollTo = jest.fn();
});

function flushPromises() {
  return new Promise((res) => setTimeout(res, 0));
}

describe('MessageThread quote actions', () => {
  it('lets clients open quote review from the quote bubble', async () => {
    (api.useAuth as jest.Mock).mockReturnValue({ user: { id: 7, user_type: 'client' } });
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 9,
          sender_type: 'service_provider',
          content: 'Quote message',
          // Simulate backend response with uppercase message type.
          message_type: 'QUOTE',
          quote_id: 42,
          is_read: true,
          timestamp: '2025-01-01T00:00:00Z',
        },
      ],
    });
    (api.getQuoteV2 as jest.Mock).mockResolvedValue({
      data: {
        id: 42,
        services: [{ description: 'Performance', price: 100 }],
        sound_fee: 0,
        travel_fee: 0,
        subtotal: 100,
        total: 100,
        status: 'pending',
      },
    });
    (api.acceptQuoteV2 as jest.Mock).mockResolvedValue({ data: { id: 1 } });
    (api.getBookingDetails as jest.Mock).mockResolvedValue({ data: { id: 99, deposit_amount: 50 } });

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MessageThread bookingRequestId={1} />, 
      );
    });
    await act(async () => { await flushPromises(); });
    await act(async () => { await flushPromises(); });
    await act(async () => { await flushPromises(); });
    await act(async () => { await flushPromises(); });
    await act(async () => { await flushPromises(); });


    const acceptButton = container.querySelector('#quote-42 button');
    expect(acceptButton?.textContent).toBe('Accept Quote');

    act(() => {
      acceptButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => { await flushPromises(); });

    expect(api.acceptQuoteV2).toHaveBeenCalledWith(42, undefined);

    act(() => root.unmount());
    container.remove();
  });

  it('renders quote bubble for system review_quote messages', async () => {
    (api.useAuth as jest.Mock).mockReturnValue({ user: { id: 7, user_type: 'client' } });
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 9,
          sender_type: 'service_provider',
          content: 'Review & Accept Quote',
          message_type: 'SYSTEM',
          action: 'review_quote',
          visible_to: 'client',
          quote_id: '55',
          is_read: true,
          timestamp: '2025-01-01T00:00:00Z',
        },
      ],
    });
    (api.getQuoteV2 as jest.Mock).mockResolvedValue({
      data: {
        id: 55,
        services: [{ description: 'Performance', price: 100 }],
        sound_fee: 0,
        travel_fee: 0,
        subtotal: 100,
        total: 100,
        status: 'pending',
      },
    });

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MessageThread bookingRequestId={1} />, 
      );
    });
    await act(async () => { await flushPromises(); });
    await act(async () => { await flushPromises(); });

    const bubble = container.querySelector('#quote-55');
    expect(bubble).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('ignores messages with quote_id 0', async () => {
    (api.useAuth as jest.Mock).mockReturnValue({ user: { id: 7, user_type: 'client' } });
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 9,
          sender_type: 'service_provider',
          content: 'Invalid quote message',
          message_type: 'QUOTE',
          quote_id: 0,
          is_read: true,
          timestamp: '2025-01-01T00:00:00Z',
        },
      ],
    });

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MessageThread bookingRequestId={1} />, 
      );
    });
    await act(async () => { await flushPromises(); });
    await act(async () => { await flushPromises(); });

    expect(api.getQuoteV2).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Invalid quote message');

    act(() => root.unmount());
    container.remove();
  });

  it('shows quote bubble to artists when no quote exists', async () => {
    (api.useAuth as jest.Mock).mockReturnValue({ user: { id: 2, user_type: 'service_provider' } });
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({ data: [] });
    (api.getQuoteV2 as jest.Mock).mockResolvedValue({ data: null });
    (api.getBookingDetails as jest.Mock).mockResolvedValue({ data: { id: 1, service: { title: 'Gig' } } });

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MessageThread
          bookingRequestId={1}
          initialBaseFee={100}
          initialTravelCost={50}
          initialSoundNeeded
        />,
      );
    });
    await act(async () => { await flushPromises(); });

    const inlineQuote = container.querySelector('[data-testid="artist-inline-quote"]');
    expect(inlineQuote).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});

describe('MessageThread composer positioning', () => {
  it('uses CSS variable to offset the composer from the bottom nav', async () => {
    (api.useAuth as jest.Mock).mockReturnValue({ user: { id: 7, user_type: 'client' } });
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({ data: [] });

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} />);
    });
    await act(async () => { await flushPromises(); });

    const composer = container.querySelector('[data-testid="composer-container"]');
    expect(composer).not.toBeNull();
    expect((composer as HTMLElement).style.paddingBottom).toBe(
      'var(--mobile-bottom-nav-offset, var(--mobile-bottom-nav-height,56px))',
    );

    act(() => root.unmount());
    container.remove();
  });
});
