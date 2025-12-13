import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import DashboardPage from '../page';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams, usePathname } from '@/tests/mocks/next-navigation';
import { Service } from '@/types';
import { flushPromises } from '@/test/utils/flush';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');

beforeEach(() => {
  useSearchParams.mockReturnValue({ get: () => null });
});

describe('Service deletion confirmation', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const service: Service = {
    id: 1,
    artist_id: 2,
    title: 'Gig',
    description: 'desc',
    media_url: 'img.jpg',
    service_type: 'Live Performance',
    duration_minutes: 60,
    display_order: 1,
    price: 100,
    artist: {} as unknown as import('@/types').ServiceProviderProfile,
  };

  beforeEach(async () => {
    useRouter.mockReturnValue({ push: jest.fn(), replace: jest.fn() });
    usePathname.mockReturnValue('/dashboard/artist');
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 2, user_type: 'service_provider', email: 'a@example.com' } });
    (api.getMyArtistBookingsCached as jest.Mock).mockResolvedValue([]);
    (api.getMyServices as jest.Mock).mockResolvedValue({ data: [service] });
    (api.getServiceProviderProfileMe as jest.Mock).mockResolvedValue({ data: {} });
    (api.getBookingRequestsForArtistCached as jest.Mock).mockResolvedValue([]);
    (api.getDashboardStatsCached as jest.Mock).mockResolvedValue({ monthly_new_inquiries: 0, profile_views: 0, response_rate: 0 });
    (api.getGoogleCalendarStatus as jest.Mock).mockResolvedValue({ data: { connected: false } });
    (api.deleteService as jest.Mock).mockResolvedValue({});

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<DashboardPage />);
    });
    const tabBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Services'
    ) as HTMLButtonElement;
    if (tabBtn) {
      await act(async () => {
        tabBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }
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

  it('asks for confirmation before deleting', async () => {
    const originalConfirm = window.confirm;
    window.confirm = jest.fn(() => true);
    const deleteBtn = container.querySelector('button[aria-label="Delete"]') as HTMLButtonElement;
    expect(deleteBtn).toBeTruthy();
    await act(async () => {
      deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(window.confirm).toHaveBeenCalled();
    expect(api.deleteService).toHaveBeenCalledWith(service.id);
    window.confirm = originalConfirm;
  });

  it('shows error message when deletion fails', async () => {
    (api.deleteService as jest.Mock).mockRejectedValue(new Error('fail'));
    const originalConfirm = window.confirm;
    window.confirm = jest.fn(() => true);
    const deleteBtn = container.querySelector('button[aria-label="Delete"]') as HTMLButtonElement;
    await act(async () => {
      deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await flushPromises();
    });
    expect(container.textContent).toContain('Failed to delete service');
    window.confirm = originalConfirm;
  });
});
