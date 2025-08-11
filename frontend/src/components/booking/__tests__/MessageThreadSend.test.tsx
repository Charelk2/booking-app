jest.mock('@/hooks/useWebSocket', () => () => ({ send: jest.fn(), onMessage: jest.fn(), updatePresence: jest.fn() }));
jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import MessageThread from '../MessageThread';
import * as api from '@/lib/api';

describe('MessageThread send flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: 'client', email: 'c@example.com' } });
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({ data: [] });
    (api.getQuoteV2 as jest.Mock).mockResolvedValue({ data: null });
    (api.getBookingDetails as jest.Mock).mockResolvedValue({
      data: { id: 1, service: { title: 'Gig' }, start_time: '2024-01-01T00:00:00Z' },
    });
    (Element.prototype as any).scrollTo = jest.fn();
  });

  it('sends a message and clears the input', async () => {
    (api.postMessageToBookingRequest as jest.Mock).mockResolvedValue({ data: { id: 1 } });
    const { findByPlaceholderText, findByLabelText } = render(
      <MessageThread bookingRequestId={1} />,
    );
    const textarea = (await findByPlaceholderText('Type your message...')) as HTMLTextAreaElement;
    const button = (await findByLabelText('Send message')) as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    fireEvent.change(textarea, { target: { value: ' Hello ' } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);

    await waitFor(() => {
      expect(api.postMessageToBookingRequest).toHaveBeenCalledWith(1, {
        content: 'Hello',
        attachment_url: undefined,
      });
    });
    expect(textarea.value).toBe('');
  });

  it('does not send empty messages', async () => {
    const { findByPlaceholderText, findByLabelText } = render(
      <MessageThread bookingRequestId={1} />,
    );
    const textarea = await findByPlaceholderText('Type your message...');
    const button = await findByLabelText('Send message');

    fireEvent.change(textarea, { target: { value: '   ' } });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    await new Promise((res) => setTimeout(res, 0));
    expect(api.postMessageToBookingRequest).not.toHaveBeenCalled();
  });

  it('queues messages when offline and flushes on reconnect', async () => {
    (api.postMessageToBookingRequest as jest.Mock).mockResolvedValue({ data: { id: 2 } });
    const { findByPlaceholderText, findByLabelText } = render(
      <MessageThread bookingRequestId={1} />,
    );
    const textarea = (await findByPlaceholderText('Type your message...')) as HTMLTextAreaElement;
    const button = (await findByLabelText('Send message')) as HTMLButtonElement;
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    fireEvent.change(textarea, { target: { value: 'Offline msg' } });
    fireEvent.click(button);
    await new Promise((res) => setTimeout(res, 0));
    expect(api.postMessageToBookingRequest).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'onLine', { value: true });
    window.dispatchEvent(new Event('online'));
    await waitFor(() => {
      expect(api.postMessageToBookingRequest).toHaveBeenCalled();
    });
  });
});
