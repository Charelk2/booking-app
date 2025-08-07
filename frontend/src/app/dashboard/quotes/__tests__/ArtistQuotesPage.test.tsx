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
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 2, user_type: 'artist', email: 'a@example.com' } });
    (api.getMyArtistQuotes as jest.Mock).mockResolvedValue({
      data: [
        { id: 1, booking_request_id: 9, artist_id: 2, quote_details: 'Offer', price: 100, currency: 'ZAR', status: 'pending_client_action', created_at: '', updated_at: '' },
        { id: 2, booking_request_id: 9, artist_id: 2, quote_details: 'Accepted', price: 120, currency: 'ZAR', status: 'accepted_by_client', created_at: '', updated_at: '' },
      ],
    });
    (api.updateQuoteAsArtist as jest.Mock).mockResolvedValue({ data: {} });
    (api.confirmQuoteBooking as jest.Mock).mockResolvedValue({ data: {} });

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
    expect(api.updateQuoteAsArtist).toHaveBeenCalledWith(1, { status: 'withdrawn_by_artist' });

    const confirmBtn = Array.from(div.querySelectorAll('button')).find(b => b.textContent === 'Confirm Booking') as HTMLButtonElement;
    expect(confirmBtn).toBeTruthy();
    await act(async () => {
      confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(api.confirmQuoteBooking).toHaveBeenCalledWith(2);
    expect(
      (toast.success as jest.Mock).mock.calls.some(
        (c) => c[0] === 'Booking confirmed',
      ),
    ).toBe(false);

    act(() => {
      root.unmount();
    });
    div.remove();
  });

  it('opens edit modal and saves changes', async () => {
    useRouter.mockReturnValue({ push: jest.fn() });
    usePathname.mockReturnValue('/dashboard/quotes');
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 2, user_type: 'artist', email: 'a@example.com' } });
    (api.getMyArtistQuotes as jest.Mock).mockResolvedValue({
      data: [
        { id: 1, booking_request_id: 9, artist_id: 2, quote_details: 'Offer', price: 100, currency: 'ZAR', status: 'pending_client_action', created_at: '', updated_at: '' },
      ],
    });
    (api.updateQuoteAsArtist as jest.Mock).mockResolvedValue({ data: {} });

    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);

    await act(async () => {
      root.render(<ArtistQuotesPage />);
    });
    await flushPromises();

    const editBtn = Array.from(div.querySelectorAll('button')).find(b => b.textContent === 'Edit') as HTMLButtonElement;
    expect(editBtn).toBeTruthy();
    await act(async () => {
      editBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const textarea = div.querySelector('textarea') as HTMLTextAreaElement;
    const input = div.querySelector('input[type="number"]') as HTMLInputElement;
    expect(textarea).not.toBeNull();
    await act(async () => {
      textarea.value = 'Updated';
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      input.value = '150';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const form = div.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true }));
    });

    expect(api.updateQuoteAsArtist).toHaveBeenCalledWith(1, { quote_details: 'Updated', price: 150 });

    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
