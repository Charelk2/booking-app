import { flushPromises } from "@/test/utils/flush";
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import ArtistQuotesPage from '../page';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from '@/tests/mocks/next-navigation';
import toast from '@/components/ui/Toast';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');
jest.mock('@/components/ui/Toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));


describe('ArtistQuotesPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders quotes and triggers actions', async () => {
    useRouter.mockReturnValue({ push: jest.fn() });
    usePathname.mockReturnValue('/dashboard/quotes');
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 2, user_type: 'service_provider', email: 'a@example.com' } });
    (api.getMyArtistQuotes as jest.Mock).mockResolvedValue({
      data: [
        { id: 1, booking_request_id: 9, artist_id: 2, client_id: 7, services: [{ description: 'Offer', price: 100 }], sound_fee: 0, travel_fee: 0, subtotal: 100, total: 100, status: 'pending', created_at: '', updated_at: '' },
        { id: 2, booking_request_id: 9, artist_id: 2, client_id: 7, services: [{ description: 'Accepted', price: 120 }], sound_fee: 0, travel_fee: 0, subtotal: 120, total: 120, status: 'accepted', created_at: '', updated_at: '' },
      ],
    });
    (api.withdrawQuoteV2 as jest.Mock).mockResolvedValue({ data: {} });

    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);

    await act(async () => {
      root.render(<ArtistQuotesPage />);
    });
    await flushPromises();

    const withdrawBtn = Array.from(div.querySelectorAll('button')).find(b => b.textContent === 'Withdraw') as HTMLButtonElement;
    expect(withdrawBtn).toBeTruthy();
    await act(async () => {
      withdrawBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(api.withdrawQuoteV2).toHaveBeenCalledWith(1);

    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
