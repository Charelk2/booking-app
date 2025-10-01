import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import MessageThread from '../MessageThread';
import * as api from '@/lib/api';

const makeEnvelope = (items: any[] = []) => ({
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
  },
});

jest.mock('@emoji-mart/data', () => ({}));

// Mock emoji picker to provide deterministic emoji selection
jest.mock('next/dynamic', () => () => {
  const React = require('react');
  return ({ onEmojiSelect }: { onEmojiSelect: (emoji: { native: string }) => void }) => (
    <div data-testid="emoji-picker">
      <button onClick={() => onEmojiSelect({ native: '😀' })}>😀</button>
    </div>
  );
});

jest.mock('@/hooks/useWebSocket', () => () => ({ send: jest.fn(), onMessage: jest.fn(), updatePresence: jest.fn() }));
jest.mock('@/lib/api');

describe('MessageThread emoji picker', () => {
  beforeEach(() => {
    (api.useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: 'client' } });
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue(makeEnvelope());
    (api.getQuoteV2 as jest.Mock).mockResolvedValue({ data: null });
    (api.getBookingDetails as jest.Mock).mockResolvedValue({ data: { id: 1, service: { title: 'Gig' } } });
  });

  it('appends selected emoji to the message input', async () => {
    const { findByLabelText, findByTestId, findByPlaceholderText } = render(
      <MessageThread bookingRequestId={1} />,
    );

    const emojiButton = await findByLabelText('Add emoji');
    fireEvent.click(emojiButton);

    const picker = await findByTestId('emoji-picker');
    const textarea = (await findByPlaceholderText('Type your message...')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello' } });

    fireEvent.click(picker.querySelector('button') as HTMLButtonElement);

    expect(textarea.value).toBe('Hello😀');
  });
});
