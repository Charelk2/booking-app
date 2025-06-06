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

describe('MessageThread scroll button', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({ data: [] });
    (api.getQuotesForBookingRequest as jest.Mock).mockResolvedValue({ data: [] });
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: 'client' } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    // jsdom lacks scrollIntoView which is used by the component
    // @ts-expect-error jsdom lacks scrollIntoView
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it('shows button when scrolled away from bottom', async () => {
    await act(async () => {
      root.render(React.createElement(MessageThread, { bookingRequestId: 1 }));
    });
    const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLElement;
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 200, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 100, configurable: true });
    scrollContainer.scrollTop = 0;
    act(() => {
      scrollContainer.dispatchEvent(new Event('scroll'));
    });
    const button = container.querySelector('button[aria-label="Scroll to latest message"]');
    expect(button).not.toBeNull();
  });
});
