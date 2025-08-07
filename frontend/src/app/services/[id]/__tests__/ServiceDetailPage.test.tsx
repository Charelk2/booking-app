import { flushPromises } from "@/test/utils/flush";
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import ServiceDetailPage from '../page';
import { getService, getServiceReviews } from '@/lib/api';
import { useParams, usePathname } from '@/tests/mocks/next-navigation';

jest.mock('@/lib/api');


describe('ServiceDetailPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('fetches service and reviews', async () => {
    useParams.mockReturnValue({ id: '1' });
    usePathname.mockReturnValue('/services/1');
    (getService as jest.Mock).mockResolvedValue({
      data: {
        id: 1,
        title: 'Service',
        description: 'Desc',
        price: 50,
        duration_minutes: 30,
        artist_id: 1,
      },
    });
    (getServiceReviews as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 2,
          booking_id: 3,
          rating: 4,
          comment: 'Good',
          created_at: '',
          updated_at: '',
          client: { first_name: 'A' },
        },
      ],
    });

    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(<ServiceDetailPage />);
    });
    await flushPromises();

    expect(getService).toHaveBeenCalledWith(1);
    expect(getServiceReviews).toHaveBeenCalledWith(1);
    expect(div.textContent).toContain('Good');

    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
