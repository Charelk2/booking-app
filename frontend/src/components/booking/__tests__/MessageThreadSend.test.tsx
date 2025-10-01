jest.mock('@/hooks/useWebSocket', () => () => ({ send: jest.fn(), onMessage: jest.fn(), updatePresence: jest.fn() }));
jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import MessageThread from '../MessageThread';
import * as api from '@/lib/api';

const makeEnvelope = (items: any[] = [], overrides: Partial<api.MessageListResponseEnvelope> = {}) => ({
  data: {
    mode: 'full' as const,
    items,
    has_more: false,
    next_cursor: null,
    delta_cursor: null,
    requested_after_id: null,
    requested_since: null,
    total_latency_ms: 0,
    db_latency_ms: 0,
    payload_bytes: 0,
    ...overrides,
  },
});

describe('MessageThread send flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: 'client', email: 'c@example.com' } });
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue(makeEnvelope());
    (api.getQuoteV2 as jest.Mock).mockResolvedValue({ data: null });
    (api.getBookingDetails as jest.Mock).mockResolvedValue({
      data: { id: 1, service: { title: 'Gig' }, start_time: '2024-01-01T00:00:00Z' },
    });
    (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = jest.fn();
    // Mock blob URL helpers used by MessageThread
    (global.URL.createObjectURL as unknown as () => string) = jest.fn(() => 'blob:mock');
    (global.URL.revokeObjectURL as unknown as (url: string) => void) = jest.fn();
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

  it('uploads attachment and includes attachment_url', async () => {
    (api.postMessageToBookingRequest as jest.Mock).mockResolvedValue({ data: { id: 3 } });
    (api.uploadMessageAttachment as jest.Mock).mockResolvedValue({
      data: { url: '/static/attachments/file.png' },
    });
    const { container, findByPlaceholderText, findByLabelText } = render(
      <MessageThread bookingRequestId={1} />,
    );
    const textarea = (await findByPlaceholderText('Type your message...')) as HTMLTextAreaElement;
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const sendButton = (await findByLabelText('Send message')) as HTMLButtonElement;

    const file = new File(['hello'], 'hello.png', { type: 'image/png' });
    fireEvent.change(textarea, { target: { value: 'Hi with file' } });
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(api.uploadMessageAttachment).toHaveBeenCalledWith(1, file, expect.any(Function));
      expect(api.postMessageToBookingRequest).toHaveBeenCalledWith(1, {
        content: 'Hi with file',
        attachment_url: '/static/attachments/file.png',
      });
    });
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
