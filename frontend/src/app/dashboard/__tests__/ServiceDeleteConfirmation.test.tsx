import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import DashboardPage from '../page';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Service } from '@/types';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(() => '/dashboard'),
}));

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
  });

  afterEach(() => {
    root.unmount();
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
});
