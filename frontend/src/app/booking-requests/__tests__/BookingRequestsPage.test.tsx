import { flushPromises } from "@/test/utils/flush";
import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import BookingRequestsPage from '../page';
import * as api from '@/lib/api';
import useNotifications from '@/hooks/useNotifications.tsx';
import { useRouter, usePathname } from '@/tests/mocks/next-navigation';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('@/lib/api');
jest.mock('@/hooks/useNotifications.tsx');
jest.mock('@/contexts/AuthContext');
jest.mock('@/components/layout/MainLayout', () => {
  const Mock = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Mock.displayName = 'MockMainLayout';
  return Mock;
});


function setup(markItem = jest.fn()) {
  (useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: 'client' } });
  const push = jest.fn();
  useRouter.mockReturnValue({ push });
  usePathname.mockReturnValue('/booking-requests');
  (useNotifications as jest.Mock).mockReturnValue({
    items: [
      {
        type: 'new_booking_request',
        is_read: false,
        link: '/booking-requests/1',
        timestamp: new Date().toISOString(),
        content: '',
        id: 1,
      },
    ],
    markItem,
  });
  (api.getMyBookingRequestsCached as jest.Mock).mockResolvedValue(null);
  (api.getBookingRequestsForArtistCached as jest.Mock).mockResolvedValue(null);
  (api.getMyBookingRequests as jest.Mock).mockResolvedValue({
    data: [
      {
        id: 1,
        client_id: 1,
        artist_id: 2,
        status: 'new',
        proposed_datetime_1: '2025-06-10T12:00:00Z',
        created_at: '2025-06-01T00:00:00Z',
        updated_at: '',
        client: { first_name: 'Alice', last_name: 'A' },
        artist: { business_name: 'Artist One', user: { first_name: 'AO' } },
        artist_profile: { business_name: 'Artist One' },
        service: { service_type: 'Live Performance' },
      },
      {
        id: 2,
        client_id: 2,
        artist_id: 2,
        status: 'pending_quote',
        proposed_datetime_1: '2025-06-11T12:00:00Z',
        created_at: '2025-06-02T00:00:00Z',
        updated_at: '',
        client: { first_name: 'Bob', last_name: 'B' },
        artist: { business_name: 'Artist Two', user: { first_name: 'AT' } },
        artist_profile: { business_name: 'Artist Two' },
        service: { service_type: 'Custom Song' },
      },
    ],
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root, push, markItem };
}

describe('BookingRequestsPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('highlights unread requests and shows badge', async () => {
    const { container, root } = setup();
    await act(async () => {
      root.render(<BookingRequestsPage />);
    });
    await flushPromises();
    const aliceRow = container.querySelector('li[data-request-id="1"]');
    expect(aliceRow?.className).toContain('bg-brand-light');
    const badge = aliceRow?.querySelector('span.bg-red-600');
    expect(badge?.textContent).toBe('1');
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('filters by client name', async () => {
    const { container, root } = setup();
    await act(async () => {
      root.render(<BookingRequestsPage />);
    });
    await flushPromises();
    const input = container.querySelector(
      'input[aria-label="Search by artist name"]',
    ) as HTMLInputElement;
    act(() => {
      input.value = 'Artist Two';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flushPromises();
    const bobRow = Array.from(container.querySelectorAll('li[data-request-id]')).find((li) =>
      li.textContent?.includes('Artist Two'),
    );
    expect(bobRow).toBeTruthy();
    act(() => {
      root.unmount();
    });
    container.remove();
  });


  it('marks notifications read when row clicked', async () => {
    const { container, root, push, markItem } = setup(jest.fn());
    await act(async () => {
      root.render(<BookingRequestsPage />);
    });
    await flushPromises();
    const row = container.querySelector('li[data-request-id="1"]') as HTMLLIElement;
    await act(async () => {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();
    expect(markItem).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/booking-requests/1');
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
