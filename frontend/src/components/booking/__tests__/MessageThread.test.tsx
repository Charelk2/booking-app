import { flushPromises } from "@/test/utils/flush";
import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import MessageThread from '../MessageThread';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');
jest.mock('../SendQuoteModal', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  function MockModal(props: { open: boolean; onSubmit: (data: unknown) => void }) {
    const { open, onSubmit } = props;
    React.useEffect(() => {
      if (open) {
        onSubmit({});
      }
    }, [open, onSubmit]);
    return null;
  }
  return { __esModule: true, default: MockModal };
});


// Minimal WebSocket stub
class StubSocket {
  static last: StubSocket | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: unknown) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    StubSocket.last = this;
  }
  close() {}
}
// @ts-expect-error jsdom does not implement WebSocket
global.WebSocket = StubSocket;

describe('MessageThread component', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({ data: [] });
    (api.getQuoteV2 as jest.Mock).mockResolvedValue({ data: { id: 1 } });
    (api.acceptQuoteV2 as jest.Mock).mockResolvedValue({ data: { id: 1 } });
    (api.getBookingDetails as jest.Mock).mockResolvedValue({
      data: {
        id: 1,
        service: { title: 'Gig' },
        start_time: '2024-01-01T00:00:00Z',
        deposit_amount: 50,
        deposit_due_by: '2024-01-08T00:00:00Z',
      },
    });
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: 'client', email: 'c@example.com' } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    // jsdom lacks scrollIntoView which is used by the component
    // @ts-expect-error jsdom lacks scrollIntoView
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
    // stub createObjectURL used for previews
    global.URL.createObjectURL = jest.fn(() => 'blob:preview');
    global.URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows scroll-to-latest button when scrolled away from bottom', async () => {
    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} serviceId={4} />);
    });
    await new Promise((r) => setTimeout(r, 0));
    await act(async () => {
      await flushPromises();
    });
    const scrollContainer = document.querySelector('.overflow-y-auto') as HTMLElement;

    // Simulate a scrollable container
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 200, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 100, configurable: true });
    scrollContainer.scrollTop = 0;

    await act(async () => {
      scrollContainer.dispatchEvent(new Event('scroll'));
    });
    await act(async () => {
      await flushPromises();
    });

    const button = container.querySelector('button[aria-label="Scroll to latest message"]');
    expect(button).not.toBeNull();
  });

  it('highlights unread messages', async () => {
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 2,
          sender_type: 'artist',
          content: 'Hello there',
          message_type: 'text',
          timestamp: new Date().toISOString(),
          unread: true,
        },
      ],
    });

    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} serviceId={4} />);
    });
    
    await act(async () => {
      await flushPromises();
    });
    const highlightedRow = container.querySelector('.bg-indigo-50');
    const senderName = container.querySelector('span.font-semibold');
    const badge = container.querySelector('span[aria-label="Unread messages"]');
    expect(highlightedRow).not.toBeNull();
    expect(badge).not.toBeNull();
    expect(senderName).toBeNull();
  });

  it('displays short messages', async () => {
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 2,
          sender_type: 'artist',
          content: 'Hi',
          message_type: 'text',
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          id: 2,
          booking_request_id: 1,
          sender_id: 1,
          sender_type: 'client',
          content: 'Hello there',
          message_type: 'text',
          timestamp: '2024-01-01T00:00:01Z',
        },
      ],
    });

    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} serviceId={4} />);
    });

    const messageBubbles = container.querySelectorAll('.whitespace-pre-wrap');
    expect(messageBubbles.length).toBe(2);
    expect(messageBubbles[0].textContent).toContain('Hi');
    expect(messageBubbles[1].textContent).toContain('Hello there');
  });

  it('filters the initial notes message', async () => {
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 1,
          sender_type: 'client',
          content: 'none',
          message_type: 'text',
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          id: 2,
          booking_request_id: 1,
          sender_id: 2,
          sender_type: 'artist',
          content: 'Booking details:\nNotes: none',
          message_type: 'system',
          timestamp: '2024-01-01T00:00:01Z',
        },
      ],
    });

    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} initialNotes="none" />);
    });

    const bubbles = container.querySelectorAll('.whitespace-pre-wrap');
    expect(bubbles.length).toBe(1);
    expect(bubbles[0].textContent).toContain('Booking details');
  });

  it('groups messages into timestamp windows', async () => {
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 2,
          sender_type: 'artist',
          content: 'First',
          message_type: 'text',
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          id: 2,
          booking_request_id: 1,
          sender_id: 2,
          sender_type: 'artist',
          content: 'Second',
          message_type: 'text',
          timestamp: '2024-01-01T00:05:00Z',
        },
        {
          id: 3,
          booking_request_id: 1,
          sender_id: 2,
          sender_type: 'artist',
          content: 'Later',
          message_type: 'text',
          timestamp: '2024-01-01T00:20:00Z',
        },
      ],
    });

    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} serviceId={4} />);
    });

    const groups = container.querySelectorAll('.text-xs.text-gray-400.mb-1');
    expect(groups.length).toBe(2);
  });

  it('shows full date divider between days', async () => {
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 2,
          sender_type: 'artist',
          content: 'Previous day',
          message_type: 'text',
          timestamp: '2024-06-09T23:59:00Z',
        },
        {
          id: 2,
          booking_request_id: 1,
          sender_id: 1,
          sender_type: 'client',
          content: 'Next day',
          message_type: 'text',
          timestamp: '2024-06-10T00:01:00Z',
        },
      ],
    });

    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} serviceId={4} />);
    });

    const divider = container.querySelector('[data-testid="day-divider"]');
    expect(divider?.textContent).toBe(
      new Date('2024-06-10T00:01:00Z').toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    );
  });

  it('deduplicates websocket messages already fetched', async () => {
    const msg = {
      id: 99,
      booking_request_id: 1,
      sender_id: 2,
      sender_type: 'artist',
      content: 'Who is the video for?',
      message_type: 'system',
      timestamp: '2024-01-01T00:00:00Z',
    } as const;

    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
      data: [msg],
    });
    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} serviceId={4} />);
    });

    await act(async () => {
      await flushPromises();
    });

    const socket = StubSocket.last as StubSocket;
    act(() => {
      socket.onmessage?.({ data: JSON.stringify(msg) });
    });

    const bubbles = container.querySelectorAll('.whitespace-pre-wrap');
    expect(bubbles.length).toBe(1);
  });

  it('shows progress indicator while uploading attachment', async () => {
    let resolveUpload: () => void;
    (api.uploadMessageAttachment as jest.Mock).mockImplementation(
      (_id: number, _file: File, cb?: (e: { loaded: number; total: number }) => void) => {
        cb?.({ loaded: 50, total: 100 });
        return new Promise((res) => {
          resolveUpload = () => {
            cb?.({ loaded: 100, total: 100 });
            res({ data: { url: '/f' } });
          };
        });
      },
    );

    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} serviceId={4} />);
    });
    await act(async () => {
      await flushPromises();
    });

    const input = container.querySelector('#file-upload') as HTMLInputElement;
    const file = new File(['a'], 'a.txt', { type: 'text/plain' });
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file] });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const sendButton = container.querySelector('form button[type="submit"]') as HTMLButtonElement;
    expect(sendButton).not.toBeNull();
    act(() => {
      sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await flushPromises();
    });

    const progress = container.querySelector('[role="progressbar"]');
    expect(progress).not.toBeNull();
    expect(sendButton.disabled).toBe(true);

    await act(async () => {
      resolveUpload();
    });

    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    expect(sendButton.disabled).toBe(false);
  });

  it('has accessible labels for actions', async () => {
    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} />);
    });
    await act(async () => {
      await flushPromises();
    });
    const uploadButton = container.querySelector('label[for="file-upload"]');
    expect(uploadButton?.getAttribute('aria-label')).toBe('Upload attachment');
    const sendButton = container.querySelector('form button[type="submit"]');
    expect(sendButton?.getAttribute('aria-label')).toBe('Send message');
  });

  it('renders booking details in a collapsible section', async () => {
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 2,
          sender_type: 'artist',
          content: 'Booking details:\nLocation: Test City\nNotes: Hello',
          message_type: 'system',
          timestamp: '2024-01-01T00:00:00Z',
        },
      ],
    });

    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} />);
    });
    await act(async () => {
      await flushPromises();
    });

    const details = container.querySelector('[data-testid="booking-details"]');
    const button = container.querySelector(
      '[data-testid="booking-details-button"]',
    ) as HTMLButtonElement;
    expect(details).not.toBeNull();
    expect(button?.getAttribute('aria-expanded')).toBe('false');
    expect(
      container.querySelector('[data-testid="booking-details-content"]')?.getAttribute('aria-hidden'),
    ).toBe('true');
    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const content = container.querySelector('[data-testid="booking-details-content"]');
    expect(button?.getAttribute('aria-expanded')).toBe('true');
    const terms = Array.from(content?.querySelectorAll('dt') || []);
    const values = Array.from(content?.querySelectorAll('dd') || []);
    expect(terms.map((n) => n.textContent)).toEqual(['Location', 'Notes']);
    expect(values.map((n) => n.textContent)).toEqual(['Test City', 'Hello']);
  });

  it('announces new messages when scrolled away from bottom', async () => {
    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} />);
    });
    await act(async () => {
      await flushPromises();
    });
    const scrollContainer = document.querySelector('.overflow-y-auto') as HTMLElement;
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 200, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 100, configurable: true });
    scrollContainer.scrollTop = 0;
    act(() => {
      scrollContainer.dispatchEvent(new Event('scroll'));
    });
    const socket = StubSocket.last as StubSocket;
    const msg = {
      id: 2,
      booking_request_id: 1,
      sender_id: 2,
      sender_type: 'artist',
      content: 'Hi',
      message_type: 'text',
      timestamp: new Date().toISOString(),
    };
    act(() => {
      socket.onmessage?.({ data: JSON.stringify(msg) });
    });
    await act(async () => {
      await flushPromises();
    });
    const live = container.querySelector('div.sr-only[aria-live="polite"]');
    expect(live).not.toBeNull();
  });

  it('shows send quote button for artist', async () => {
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 2, user_type: 'artist' } });
    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} clientId={1} artistId={2} />);
    });
    await act(async () => {
      await flushPromises();
    });
    const buttons = container.querySelectorAll('button');
    const found = Array.from(buttons).find((b) => b.textContent === 'Send Quote');
    expect(found).not.toBeUndefined();
  });

  it('refreshes messages after creating a quote', async () => {
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 2, user_type: 'artist' } });
    (api.createQuoteV2 as jest.Mock).mockResolvedValue({ data: { id: 99 } });

    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} clientId={1} artistId={2} />);
    });
    await act(async () => {
      await flushPromises();
    });

    (api.getMessagesForBookingRequest as jest.Mock).mockClear();

    const openBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Send Quote') as HTMLButtonElement;
    act(() => {
      openBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      await flushPromises();
    });

    expect(api.createQuoteV2).toHaveBeenCalled();
    expect((api.getMessagesForBookingRequest as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });

  it('displays booking confirmation banner when quote accepted', async () => {
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 2,
          sender_type: 'artist',
          content: 'Quote sent',
          message_type: 'quote',
          quote_id: 5,
          timestamp: new Date().toISOString(),
        },
      ],
    });
    (api.getQuoteV2 as jest.Mock).mockResolvedValue({
      data: { id: 5, status: 'accepted', services: [], sound_fee: 0, travel_fee: 0, subtotal: 0, total: 0, artist_id: 2, client_id: 1, booking_request_id: 1, created_at: '', updated_at: '' },
    });
    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} artistName="DJ" />);
    });
    await act(async () => {
      await flushPromises();
    });
    await act(async () => {
      await flushPromises();
    });
    const banner = container.querySelector('[data-testid="booking-confirmed-banner"]');
    expect(banner?.textContent).toContain('Booking confirmed for DJ');
    expect(banner?.textContent).toContain('due by');
    const dashboardLink = container.querySelectorAll(
      'a[href="/dashboard/client/bookings/1"]',
    );
    expect(dashboardLink.length).toBe(1);
    const help = container.querySelector('[data-testid="help-prompt"]');
    expect(help).toBeNull();
  });

  it('loads booking details when an accepted quote is fetched', async () => {
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 2,
          sender_type: 'artist',
          content: 'Quote sent',
          message_type: 'quote',
          quote_id: 6,
          timestamp: new Date().toISOString(),
        },
      ],
    });
    (api.getBookingDetails as jest.Mock).mockResolvedValue({
      data: {
        id: 42,
        service: { title: 'Gig' },
        start_time: '2024-01-01T00:00:00Z',
        deposit_amount: 50,
        deposit_due_by: '2024-01-08T00:00:00Z',
      },
    });
    (api.getQuoteV2 as jest.Mock).mockResolvedValue({
      data: {
        id: 6,
        status: 'accepted',
        booking_id: 42,
        services: [],
        sound_fee: 0,
        travel_fee: 0,
        subtotal: 0,
        total: 0,
        artist_id: 2,
        client_id: 1,
        booking_request_id: 1,
        created_at: '',
        updated_at: '',
      },
    });
    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} />);
    });
    await act(async () => {
      await flushPromises();
    });
    await act(async () => {
      await flushPromises();
    });
    expect(api.getBookingDetails).toHaveBeenCalledWith(42);
    const dashboardLink = container.querySelectorAll(
      'a[href="/dashboard/client/bookings/42"]',
    );
    expect(dashboardLink.length).toBe(1);
  });

it('opens payment modal after accepting quote', async () => {
    let resolveAccept: () => void;
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 2,
          sender_type: 'artist',
          content: 'Quote',
          message_type: 'quote',
          quote_id: 7,
          timestamp: new Date().toISOString(),
        },
      ],
    });
    (api.getQuoteV2 as jest.Mock).mockResolvedValue({
      data: {
        id: 7,
        status: 'pending',
        services: [],
        sound_fee: 0,
        travel_fee: 0,
        subtotal: 0,
        total: 0,
        artist_id: 2,
        client_id: 1,
        booking_request_id: 1,
        created_at: '',
        updated_at: '',
      },
    });
    (api.acceptQuoteV2 as jest.Mock).mockImplementation(() =>
      new Promise((res) => {
        resolveAccept = () => res({ data: { id: 42 } });
      }),
    );

    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} serviceId={4} />);
    });
    await act(async () => {
      await flushPromises();
    });
    const acceptBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Accept',
    ) as HTMLButtonElement;
    await act(async () => {
      acceptBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await flushPromises();
    });
    await act(async () => {
      await flushPromises();
    });
    await act(async () => {
      await flushPromises();
    });
    await act(async () => {
      await flushPromises();
    });
    expect(acceptBtn.disabled).toBe(true);
    expect(acceptBtn.querySelector('.animate-spin')).not.toBeNull();
    expect(api.acceptQuoteV2).toHaveBeenCalledWith(7, 4);
    await act(async () => {
      resolveAccept();
    });
    await act(async () => {
      await flushPromises();
    });
    expect(api.getBookingDetails).toHaveBeenCalledWith(42);
    const modalHeading = container.querySelector('h2');
    expect(modalHeading?.textContent).toContain('Pay Deposit');
    const banner = container.querySelector('[data-testid="booking-confirmed-banner"]');
    expect(banner?.textContent).toContain('Gig');
    const payBtn = container.querySelector('[data-testid="pay-deposit-button"]');
    expect(payBtn).not.toBeNull();
    expect(payBtn?.textContent).toBe('Pay deposit');
    const calBtn = container.querySelector('[data-testid="add-calendar-button"]');
    expect(calBtn).not.toBeNull();
    const help = container.querySelector('[data-testid="help-prompt"]');
  expect(help).toBeNull();
});

it('refreshes messages after accepting a quote', async () => {
  let resolveAccept: () => void;
  (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
    data: [
      {
        id: 1,
        booking_request_id: 1,
        sender_id: 2,
        sender_type: 'artist',
        content: 'Quote',
        message_type: 'quote',
        quote_id: 13,
        timestamp: new Date().toISOString(),
      },
    ],
  });
  (api.getQuoteV2 as jest.Mock).mockResolvedValue({
    data: {
      id: 13,
      status: 'pending',
      services: [],
      sound_fee: 0,
      travel_fee: 0,
      subtotal: 0,
      total: 0,
      artist_id: 2,
      client_id: 1,
      booking_request_id: 1,
      created_at: '',
      updated_at: '',
    },
  });
  (api.acceptQuoteV2 as jest.Mock).mockImplementation(() =>
    new Promise((res) => {
      resolveAccept = () => res({ data: {} });
    }),
  );
  (api.getBookingDetails as jest.Mock).mockResolvedValue({
    data: {
      id: 11,
      service: { title: 'Gig' },
      start_time: '2024-01-01T00:00:00Z',
      deposit_amount: 0,
    },
  });

  await act(async () => {
    root.render(<MessageThread bookingRequestId={1} serviceId={4} />);
  });
  await act(async () => {
    await flushPromises();
  });

  (api.getMessagesForBookingRequest as jest.Mock).mockClear();

  const acceptBtn = Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent === 'Accept',
  ) as HTMLButtonElement;

  await act(async () => {
    acceptBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await act(async () => {
    await flushPromises();
  });

  await act(async () => {
    resolveAccept();
  });
  await act(async () => {
    await flushPromises();
  });

  expect((api.getMessagesForBookingRequest as jest.Mock).mock.calls.length).toBeGreaterThan(0);
});

it.skip('adds ring styles when deposit actions receive keyboard focus', async () => {
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 2,
          sender_type: 'artist',
          content: 'Quote',
          message_type: 'quote',
          quote_id: 11,
          timestamp: new Date().toISOString(),
        },
      ],
    });
    (api.getQuoteV2 as jest.Mock).mockResolvedValue({
      data: {
        id: 11,
        status: 'pending',
        services: [],
        sound_fee: 0,
        travel_fee: 0,
        subtotal: 0,
        total: 0,
        artist_id: 2,
        client_id: 1,
        booking_request_id: 1,
        created_at: '',
        updated_at: '',
      },
    });

    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} />);
    });
    await act(async () => {
      await flushPromises();
    });
    const acceptBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Accept',
    ) as HTMLButtonElement;
    await act(async () => {
      acceptBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await flushPromises();
    });
    const payBtn = container.querySelector(
      '[data-testid="pay-deposit-button"]',
    ) as HTMLButtonElement;
    const calBtn = container.querySelector(
      '[data-testid="add-calendar-button"]',
    ) as HTMLButtonElement;
    act(() => {
      payBtn.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
      );
      payBtn.focus();
    });
    expect(payBtn.className).toContain('focus-visible:ring-2');
    expect(payBtn.className).toContain('focus-visible:ring-brand');
    act(() => {
      calBtn.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
      );
      calBtn.focus();
    });
    expect(calBtn.className).toContain('focus-visible:ring-2');
    expect(calBtn.className).toContain('focus-visible:ring-brand');
  });

it('shows an error when acceptQuoteV2 fails', async () => {
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 2,
          sender_type: 'artist',
          content: 'Quote',
          message_type: 'quote',
          quote_id: 8,
          timestamp: new Date().toISOString(),
        },
      ],
    });
    (api.getQuoteV2 as jest.Mock).mockResolvedValue({
      data: {
        id: 8,
        status: 'pending',
        services: [],
        sound_fee: 0,
        travel_fee: 0,
        subtotal: 0,
        total: 0,
        artist_id: 2,
        client_id: 1,
        booking_request_id: 1,
        created_at: '',
        updated_at: '',
      },
    });
  (api.acceptQuoteV2 as jest.Mock).mockRejectedValue(new Error('fail'));
  (api.updateQuoteAsClient as jest.Mock).mockResolvedValue({ data: {} });

    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} />);
    });
    await act(async () => {
      await flushPromises();
    });

    const acceptBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Accept',
    ) as HTMLButtonElement;
    await act(async () => {
      acceptBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await flushPromises();
    });
    const alert = container.querySelector('p[role="alert"]');
  expect(alert?.textContent).toContain('fail');
  expect(api.updateQuoteAsClient).not.toHaveBeenCalled();
});

it('shows an error when quote acceptance fails', async () => {
  (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
    data: [
      {
        id: 1,
        booking_request_id: 1,
        sender_id: 2,
        sender_type: 'artist',
        content: 'Quote',
        message_type: 'quote',
        quote_id: 81,
        timestamp: new Date().toISOString(),
      },
    ],
  });
  (api.getQuoteV2 as jest.Mock).mockResolvedValue({
    data: {
      id: 81,
      status: 'pending',
      services: [],
      sound_fee: 0,
      travel_fee: 0,
      subtotal: 0,
      total: 0,
      artist_id: 2,
      client_id: 1,
      booking_request_id: 1,
      created_at: '',
      updated_at: '',
    },
  });
  (api.acceptQuoteV2 as jest.Mock).mockRejectedValue(new Error('nope'));
  (api.updateQuoteAsClient as jest.Mock).mockRejectedValue(new Error('fail'));

  await act(async () => {
    root.render(<MessageThread bookingRequestId={1} />);
  });
  await act(async () => {
    await flushPromises();
  });

  const acceptBtn = Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent === 'Accept',
  ) as HTMLButtonElement;
  await act(async () => {
    acceptBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await act(async () => {
    await flushPromises();
  });

  const alert = container.querySelector('p[role="alert"]');
  expect(alert?.textContent).toContain('nope');
  const modalHeading = container.querySelector('h2');
  expect(modalHeading).toBeNull();
  expect(api.updateQuoteAsClient).not.toHaveBeenCalled();
});

it('declines quote using legacy endpoint', async () => {
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 2,
          sender_type: 'artist',
          content: 'Quote',
          message_type: 'quote',
          quote_id: 9,
          timestamp: new Date().toISOString(),
        },
      ],
    });
    (api.getQuoteV2 as jest.Mock).mockResolvedValue({
      data: {
        id: 9,
        status: 'pending',
        services: [],
        sound_fee: 0,
        travel_fee: 0,
        subtotal: 0,
        total: 0,
        artist_id: 2,
        client_id: 1,
        booking_request_id: 1,
        created_at: '',
        updated_at: '',
      },
    });
    (api.updateQuoteAsClient as jest.Mock).mockResolvedValue({ data: {} });

    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} />);
    });
    await act(async () => {
      await flushPromises();
    });
    const declineBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Decline',
    ) as HTMLButtonElement;
    await act(async () => {
      declineBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await flushPromises();
    });
    expect(api.updateQuoteAsClient).toHaveBeenCalledWith(9, {
      status: 'rejected_by_client',
    });
  });

it('shows an error when quote decline fails', async () => {
  (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
    data: [
      {
        id: 1,
        booking_request_id: 1,
        sender_id: 2,
        sender_type: 'artist',
        content: 'Quote',
        message_type: 'quote',
        quote_id: 91,
        timestamp: new Date().toISOString(),
      },
    ],
  });
  (api.getQuoteV2 as jest.Mock).mockResolvedValue({
    data: {
      id: 91,
      status: 'pending',
      services: [],
      sound_fee: 0,
      travel_fee: 0,
      subtotal: 0,
      total: 0,
      artist_id: 2,
      client_id: 1,
      booking_request_id: 1,
      created_at: '',
      updated_at: '',
    },
  });
  (api.updateQuoteAsClient as jest.Mock).mockRejectedValue(new Error('nope'));

  await act(async () => {
    root.render(<MessageThread bookingRequestId={1} />);
  });
  await act(async () => {
    await flushPromises();
  });

  const declineBtn = Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent === 'Decline',
  ) as HTMLButtonElement;
  await act(async () => {
    declineBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await act(async () => {
    await flushPromises();
  });

  const alert = container.querySelector('p[role="alert"]');
  expect(alert?.textContent).toContain('Failed to decline quote');
});

it.skip('shows receipt link after paying deposit', async () => {
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 2,
          sender_type: 'artist',
          content: 'Quote',
          message_type: 'quote',
          quote_id: 10,
          timestamp: new Date().toISOString(),
        },
      ],
    });
    (api.getQuoteV2 as jest.Mock).mockResolvedValue({
      data: {
        id: 10,
        status: 'pending',
        services: [],
        sound_fee: 0,
        travel_fee: 0,
        subtotal: 0,
        total: 100,
        artist_id: 2,
        client_id: 1,
        booking_request_id: 1,
        created_at: '',
        updated_at: '',
      },
    });
    (api.acceptQuoteV2 as jest.Mock).mockResolvedValue({ data: {} });
    (api.createPayment as jest.Mock).mockResolvedValue({
      data: { payment_id: 'pay_2' },
    });

    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} />);
    });
    await act(async () => {
      await flushPromises();
    });
    const acceptBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Accept',
    ) as HTMLButtonElement;
    await act(async () => {
      acceptBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await flushPromises();
    });

    const payBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Pay',
    ) as HTMLButtonElement;
    await act(async () => {
      payBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await flushPromises();
    });
    await act(async () => {
      await flushPromises();
    });
    await act(async () => {
      await flushPromises();
    });

    const banner = container.querySelector('[data-testid="payment-status-banner"]');
    expect(banner?.textContent).toMatch(/Deposit.*50/);
    const link = document.querySelector('[data-testid="booking-receipt-link"]');
    expect(link).not.toBeNull();
  });

  it('shows Leave Review button for completed booking', async () => {
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 2,
          sender_type: 'artist',
          content: 'Quote',
          message_type: 'quote',
          quote_id: 12,
          timestamp: new Date().toISOString(),
        },
      ],
    });
    (api.getQuoteV2 as jest.Mock).mockResolvedValue({
      data: {
        id: 12,
        status: 'accepted',
        booking_id: 3,
        services: [],
        sound_fee: 0,
        travel_fee: 0,
        subtotal: 0,
        total: 0,
        artist_id: 2,
        client_id: 1,
        booking_request_id: 1,
        created_at: '',
        updated_at: '',
      },
    });
    (api.getBookingDetails as jest.Mock).mockResolvedValue({
      data: {
        id: 3,
        status: 'completed',
        service: { title: 'Gig' },
        start_time: '2024-01-01T00:00:00Z',
        deposit_amount: 0,
        review: null,
      },
    });

    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} />);
    });
    await act(async () => {
      await flushPromises();
    });
    await act(async () => {
      await flushPromises();
    });

    const reviewBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Leave Review',
    );
    expect(reviewBtn).not.toBeUndefined();
  });

  it('links the avatar to the artist profile when artistId is provided', async () => {
    await act(async () => {
      root.render(
        <MessageThread
          bookingRequestId={1}
          artistAvatarUrl="/avatar.jpg"
          artistId={3}
        />,
      );
    });
    await act(async () => {
      await flushPromises();
    });
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    const anchor = img?.closest('a');
    expect(anchor?.getAttribute('href')).toBe('/artists/3');
  });

  it('shows an alert when the WebSocket fails', async () => {
    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} />);
    });
    await act(async () => {
      await flushPromises();
    });
    const socket = StubSocket.last as StubSocket;
    act(() => {
      socket.onerror?.();
    });
    await act(async () => {
      await flushPromises();
    });
    const alert = container.querySelector('p[role="alert"]:last-child');
    expect(alert?.textContent).toContain('refresh the page');
  });
});
