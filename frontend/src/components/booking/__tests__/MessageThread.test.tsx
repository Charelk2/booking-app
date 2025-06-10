import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import MessageThread from '../MessageThread';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');

// Minimal WebSocket stub
class StubSocket {
  onopen: (() => void) | null = null;
  onmessage: ((e: unknown) => void) | null = null;
  onerror: (() => void) | null = null;
  close() {}
}
// @ts-expect-error jsdom does not implement WebSocket
global.WebSocket = StubSocket;

describe('MessageThread component', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({ data: [] });
    (api.getQuotesForBookingRequest as jest.Mock).mockResolvedValue({ data: [] });
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: 'client', email: 'c@example.com' } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    // jsdom lacks scrollIntoView which is used by the component
    // @ts-expect-error jsdom lacks scrollIntoView
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows scroll-to-latest button when scrolled away from bottom', async () => {
    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} />);
    });
    await new Promise((r) => setTimeout(r, 0));
    await act(async () => {
      await Promise.resolve();
    });
    const scrollContainer = document.querySelector('.overflow-y-auto') as HTMLElement;

    // Simulate a scrollable container
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 200, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 100, configurable: true });
    scrollContainer.scrollTop = 0;

    act(() => {
      scrollContainer.dispatchEvent(new Event('scroll'));
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
      root.render(<MessageThread bookingRequestId={1} />);
    });
    
    await act(async () => {
      await Promise.resolve();
    });
    const highlightedRow = container.querySelector('.bg-purple-50');
    const senderName = container.querySelector('span.font-semibold');
    expect(highlightedRow).not.toBeNull();
    expect(senderName?.textContent).toBe('Artist');
  });

  it('filters out short messages', async () => {
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
      root.render(<MessageThread bookingRequestId={1} />);
    });

    const messageBubbles = container.querySelectorAll('.whitespace-pre-wrap');
    expect(messageBubbles.length).toBe(1);
    expect(messageBubbles[0].textContent).toContain('Hello there');
  });
});
