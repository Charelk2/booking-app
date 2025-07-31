import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import MessageThread from '../MessageThread';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');

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
      root.render(<MessageThread bookingRequestId={1} />);
    });
    await act(async () => { await flushPromises(); });
    expect(container.querySelector('form')).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });
});
