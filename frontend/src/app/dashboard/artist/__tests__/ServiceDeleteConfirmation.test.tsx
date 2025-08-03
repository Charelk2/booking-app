import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import DashboardPage from '../page';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { Service } from '@/types';
import { flushPromises } from '@/test/utils/flush';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(() => '/dashboard/artist'),
  useSearchParams: jest.fn(),
}));

beforeEach(() => {
  (useSearchParams as jest.Mock).mockReturnValue({ get: () => null });
});

describe('Service deletion confirmation', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const service: Service = {
    id: 1,
    artist_id: 2,
    title: 'Gig',
    description: 'desc',
    service_type: 'Live Performance',
    duration_minutes: 60,
    display_order: 1,
    price: 100,
    artist: {} as unknown as import('@/types').ArtistProfile,
  };

  beforeEach(async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 2, user_type: 'artist', email: 'a@example.com' } });
    (api.getMyArtistBookings as jest.Mock).mockResolvedValue({ data: [] });
    (api.getArtistServices as jest.Mock).mockResolvedValue({ data: [service] });
    (api.getArtistProfileMe as jest.Mock).mockResolvedValue({ data: {} });
    (api.getBookingRequestsForArtist as jest.Mock).mockResolvedValue({ data: [] });
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
