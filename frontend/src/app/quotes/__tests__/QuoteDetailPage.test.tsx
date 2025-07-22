import { flushPromises, nextTick } from "@/test/utils/flush";
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import QuoteDetailPage from '../[quoteId]/page';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useParams } from 'next/navigation';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');


function setup() {
  (useParams as jest.Mock).mockReturnValue({ quoteId: '5' });
  (useAuth as jest.Mock).mockReturnValue({
    user: { id: 1, user_type: 'client', email: 'c@example.com', first_name: 'C' },
  });
  (api.getQuoteV2 as jest.Mock).mockResolvedValue({
    data: {
      id: 5,
      booking_request_id: 9,
      artist_id: 2,
      client_id: 1,
      services: [{ description: 'Perf', price: 100 }],
      sound_fee: 10,
      travel_fee: 20,
      accommodation: null,
      subtotal: 130,
      discount: null,
      total: 130,
      status: 'pending',
      created_at: '',
      updated_at: '',
    },
  });
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  return { div, root };
}

describe('QuoteDetailPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('displays quote details', async () => {
    const { div, root } = setup();
    await act(async () => {
      root.render(<QuoteDetailPage />);
    });
    await flushPromises();
    expect(div.textContent).toContain('Quote #5');
    expect(div.textContent).toContain('Perf');
    act(() => {
      root.unmount();
    });
    div.remove();
  });

  it('accepts quote using new endpoint', async () => {
    const { div, root } = setup();
    (api.acceptQuoteV2 as jest.Mock).mockResolvedValue({ data: { id: 1 } });
    await act(async () => {
      root.render(<QuoteDetailPage />);
    });
    await flushPromises();

    const acceptBtn = Array.from(div.querySelectorAll('button')).find(
      (b) => b.textContent === 'Accept',
    ) as HTMLButtonElement;
    await act(async () => {
      acceptBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(api.acceptQuoteV2).toHaveBeenCalledWith(5);
    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
