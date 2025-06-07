import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import DashboardPage from '../page';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { ArtistProfile, User, Service } from '@/types';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

describe('DashboardPage empty state', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: 'client' } });
    (api.getMyClientBookings as jest.Mock).mockResolvedValue({ data: [] });
    (api.getMyBookingRequests as jest.Mock).mockResolvedValue({ data: [] });

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

  it('shows placeholder when there are no bookings', () => {
    expect(container.textContent).toContain('No bookings yet');
  });
});

describe('DashboardPage artist stats', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 2, user_type: 'artist' } });
    (api.getMyArtistBookings as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          artist_id: 2,
          client_id: 3,
          service_id: 4,
          start_time: new Date().toISOString(),
          end_time: new Date().toISOString(),
          status: 'completed',
          total_price: 120,
          notes: '',
          artist: {} as ArtistProfile,
          client: {} as User,
          service: {} as Service,
        },
      ],
    });
    (api.getArtistServices as jest.Mock).mockResolvedValue({ data: [] });
    (api.getArtistProfileMe as jest.Mock).mockResolvedValue({ data: {} });
    (api.getBookingRequestsForArtist as jest.Mock).mockResolvedValue({ data: [] });

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

  it('renders monthly earnings card', () => {
    expect(container.textContent).toContain('Earnings This Month');
    expect(container.textContent).toContain('120');
  });
});

describe('DashboardPage list toggles', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 2, user_type: 'artist' } });

    const bookings = Array.from({ length: 6 }).map((_, i) => ({
      id: i,
      artist_id: 2,
      client_id: 3,
      service_id: 4,
      start_time: new Date().toISOString(),
      end_time: new Date().toISOString(),
      status: 'completed',
      total_price: 100,
      notes: '',
      artist: {} as ArtistProfile,
      client: {} as User,
      service: {} as Service,
    }));

    const requests = Array.from({ length: 6 }).map((_, i) => ({
      id: i,
      artist_id: 2,
      client_id: 3,
      service_id: 4,
      created_at: new Date().toISOString(),
      status: 'new',
      artist: {} as ArtistProfile,
      client: {} as User,
      service: {} as Service,
    }));

    (api.getMyArtistBookings as jest.Mock).mockResolvedValue({ data: bookings });
    (api.getArtistServices as jest.Mock).mockResolvedValue({ data: [] });
    (api.getArtistProfileMe as jest.Mock).mockResolvedValue({ data: {} });
    (api.getBookingRequestsForArtist as jest.Mock).mockResolvedValue({ data: requests });

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

  it('toggles booking request list', async () => {
    const toggleBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Show All'
    ) as HTMLButtonElement;
    expect(toggleBtn).toBeTruthy();
    await act(async () => {
      toggleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(toggleBtn.textContent).toContain('Collapse');
  });
});

describe('Service card drag handle', () => {
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
    artist: {} as ArtistProfile,
  };

  beforeEach(async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 2, user_type: 'artist' } });
    (api.getMyArtistBookings as jest.Mock).mockResolvedValue({ data: [] });
    (api.getArtistServices as jest.Mock).mockResolvedValue({ data: [service] });
    (api.getArtistProfileMe as jest.Mock).mockResolvedValue({ data: {} });
    (api.getBookingRequestsForArtist as jest.Mock).mockResolvedValue({ data: [] });

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

  it('temporarily disables text selection during long press', async () => {
    const card = container.querySelector('[data-testid="service-item"]') as HTMLElement;
    const handle = card.querySelector('div[aria-hidden="true"]') as HTMLElement;
    expect(card.className).not.toMatch('select-none');
    await act(async () => {
      handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(card.className).toMatch('select-none');
    await act(async () => {
      handle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    });
    expect(card.className).not.toMatch('select-none');
  });

  it('vibrates when reordering starts', async () => {
    jest.useFakeTimers();
    const card = container.querySelector('[data-testid="service-item"]') as HTMLElement;
    const handle = card.querySelector('div[aria-hidden="true"]') as HTMLElement;
    const vibrateSpy = jest.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrateSpy, configurable: true });
    await act(async () => {
      handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(vibrateSpy).toHaveBeenCalled();
    jest.useRealTimers();
  });
});
