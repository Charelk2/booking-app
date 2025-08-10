import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import DashboardPage from '../page';
import { flushPromises } from '@/test/utils/flush';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from '@/tests/mocks/next-navigation';
import type { BookingRequest, User } from '@/types';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');

describe('DashboardPage booking request sort and filter', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const baseUser: User = {
    id: 1,
    email: 'a@example.com',
    user_type: 'service_provider',
    first_name: 'A',
    last_name: 'B',
    phone_number: '',
    is_active: true,
    is_verified: true,
  };
  const requests: BookingRequest[] = [
    {
      id: 1,
      client_id: 2,
      artist_id: 1,
      status: 'pending_quote',
      created_at: '2025-05-01T00:00:00.000Z',
      updated_at: '2025-05-01T00:00:00.000Z',
      client: { ...baseUser, id: 2, first_name: 'C1' },
      artist: baseUser,
    } as BookingRequest,
    {
      id: 2,
      client_id: 3,
      artist_id: 1,
      status: 'quote_provided',
      created_at: '2025-07-01T00:00:00.000Z',
      updated_at: '2025-07-01T00:00:00.000Z',
      client: { ...baseUser, id: 3, first_name: 'C2' },
      artist: baseUser,
    } as BookingRequest,
    {
      id: 3,
      client_id: 4,
      artist_id: 1,
      status: 'pending_quote',
      created_at: '2025-06-01T00:00:00.000Z',
      updated_at: '2025-06-01T00:00:00.000Z',
      client: { ...baseUser, id: 4, first_name: 'C3' },
      artist: baseUser,
    } as BookingRequest,
  ];

  beforeEach(async () => {
    useRouter.mockReturnValue({ push: jest.fn() });
    usePathname.mockReturnValue('/dashboard/artist');
    (useAuth as jest.Mock).mockReturnValue({ user: baseUser });
    (api.getMyArtistBookings as jest.Mock).mockResolvedValue({ data: [] });
    (api.getArtistServices as jest.Mock).mockResolvedValue({ data: [] });
    (api.getServiceProviderProfileMe as jest.Mock).mockResolvedValue({ data: {} });
    (api.getBookingRequestsForArtist as jest.Mock).mockResolvedValue({ data: requests });
    (api.getDashboardStats as jest.Mock).mockResolvedValue({ data: { monthly_new_inquiries: 0, profile_views: 0, response_rate: 0 } });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<DashboardPage />);
    });
    await act(async () => {
      await flushPromises();
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.clearAllMocks();
  });

  it('sorts booking requests by oldest first', async () => {
    const select = container.querySelector('select[data-testid="request-sort"]') as HTMLSelectElement;
    await act(async () => {
      select.value = 'oldest';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flushPromises();
    const first = container.querySelector('li');
    expect(first?.textContent).toContain('C1');
  });

  it('filters booking requests by status', async () => {
    const select = container.querySelector('select[data-testid="request-status"]') as HTMLSelectElement;
    await act(async () => {
      select.value = 'quote_provided';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flushPromises();
    const items = container.querySelectorAll('li');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('C2');
  });

  it('filters booking requests by client name', async () => {
    const input = container.querySelector('input[aria-label="Search by client name"]') as HTMLInputElement;
    await act(async () => {
      input.value = 'C2';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flushPromises();
    const items = container.querySelectorAll('li');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('C2');
  });
});
