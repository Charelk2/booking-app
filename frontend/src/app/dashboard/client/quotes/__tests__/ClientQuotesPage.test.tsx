import { flushPromises } from "@/test/utils/flush";
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import ClientQuotesPage from '../page';
import { getMyClientQuotes } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from '@/tests/mocks/next-navigation';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');


describe('ClientQuotesPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders client quotes list', async () => {
    useRouter.mockReturnValue({ push: jest.fn() });
    usePathname.mockReturnValue('/dashboard/client/quotes');
    (useAuth as jest.Mock).mockReturnValue({
      user: { id: 1, user_type: 'client', email: 'c@example.com' },
    });
    (getMyClientQuotes as jest.Mock).mockResolvedValue({
      data: [
        { id: 1, booking_request_id: 2, artist_id: 3, client_id: 1, services: [{ description: 'Hi', price: 100 }], sound_fee: 0, travel_fee: 0, subtotal: 100, total: 100, status: 'pending', created_at: '', updated_at: '' },
        { id: 2, booking_request_id: 2, artist_id: 3, client_id: 1, services: [{ description: 'Done', price: 120 }], sound_fee: 0, travel_fee: 0, subtotal: 120, total: 120, status: 'accepted', created_at: '', updated_at: '' },
      ],
    });

    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);

    await act(async () => {
      root.render(<ClientQuotesPage />);
    });
    await flushPromises();

    expect(getMyClientQuotes).toHaveBeenCalled();
    expect(div.textContent).toContain('My Quotes');
    expect(div.textContent).toContain('Pending');
    expect(div.textContent).toContain('Accepted');

    act(() => {
      root.unmount();
    });
    div.remove();
  });

  it('filters quotes by status', async () => {
    useRouter.mockReturnValue({ push: jest.fn() });
    usePathname.mockReturnValue('/dashboard/client/quotes');
    (useAuth as jest.Mock).mockReturnValue({
      user: { id: 1, user_type: 'client', email: 'c@example.com' },
    });
    (getMyClientQuotes as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          booking_request_id: 2,
          artist_id: 3,
          client_id: 1,
          services: [{ description: 'Hi', price: 100 }],
          sound_fee: 0,
          travel_fee: 0,
          subtotal: 100,
          total: 100,
          status: 'pending',
          created_at: '',
          updated_at: '',
        },
      ],
    });

    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(<ClientQuotesPage />);
    });
    await flushPromises();

    const select = div.querySelector('select') as HTMLSelectElement;
    (getMyClientQuotes as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 2,
          booking_request_id: 2,
          artist_id: 3,
          client_id: 1,
          services: [{ description: 'Done', price: 120 }],
          sound_fee: 0,
          travel_fee: 0,
          subtotal: 120,
          total: 120,
          status: 'accepted',
          created_at: '',
          updated_at: '',
        },
      ],
    });
    await act(async () => {
      select.value = 'accepted';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flushPromises();

    expect(getMyClientQuotes).toHaveBeenLastCalledWith({ status: 'accepted' });
    expect(div.textContent).toContain('Accepted by Client');
    act(() => {
      root.unmount();
    });
    div.remove();
  });

});
