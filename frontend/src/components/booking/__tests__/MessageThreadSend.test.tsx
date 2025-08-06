import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import MessageThread from '../MessageThread';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');

describe('MessageThread send flow', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: 'client', email: 'c@example.com' } });
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({ data: [] });
    (api.getQuoteV2 as jest.Mock).mockResolvedValue({ data: null });
    (api.getBookingDetails as jest.Mock).mockResolvedValue({
      data: { id: 1, service: { title: 'Gig' }, start_time: '2024-01-01T00:00:00Z' },
    });
  });

  it('sends a message and clears the input', async () => {
    (api.postMessageToBookingRequest as jest.Mock).mockResolvedValue({ data: { id: 1 } });
    const { getByPlaceholderText, getByLabelText } = render(
      <MessageThread bookingRequestId={1} showQuoteModal={false} setShowQuoteModal={jest.fn()} />,
    );
    const textarea = getByPlaceholderText('Type your message...') as HTMLTextAreaElement;
    const button = getByLabelText('Send message') as HTMLButtonElement;

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
    const { getByPlaceholderText, getByLabelText } = render(
      <MessageThread bookingRequestId={1} showQuoteModal={false} setShowQuoteModal={jest.fn()} />,
    );
    const textarea = getByPlaceholderText('Type your message...');
    const button = getByLabelText('Send message');

    fireEvent.change(textarea, { target: { value: '   ' } });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    await new Promise((res) => setTimeout(res, 0));
    expect(api.postMessageToBookingRequest).not.toHaveBeenCalled();
  });
});
