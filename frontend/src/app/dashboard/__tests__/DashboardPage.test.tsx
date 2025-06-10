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
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(() => '/dashboard'),
}));

if (typeof global.PointerEvent === 'undefined') {
  // @ts-expect-error - jsdom lacks PointerEvent so we fall back to MouseEvent
  global.PointerEvent = window.MouseEvent;
}

describe('DashboardPage empty state', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: 'client', email: 'c@example.com' } });
    (api.getMyClientBookings as jest.Mock).mockResolvedValue({ data: [] });
    (api.getMyBookingRequests as jest.Mock).mockResolvedValue({ data: [] });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<DashboardPage />);
    });
    await act(async () => {});
    const bookingsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Bookings'
    ) as HTMLButtonElement;
    if (bookingsTab) {
      await act(async () => {
        bookingsTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }
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
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 2, user_type: 'artist', email: 'a@example.com' } });
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
          client: {
            id: 3,
            email: 'client@example.com',
            user_type: 'client',
            first_name: 'Client',
            last_name: 'User',
            phone_number: '',
            is_active: true,
            is_verified: true,
          } as User,
          service: {
            id: 4,
            artist_id: 2,
            title: 'Service',
            description: 'desc',
            service_type: 'Live Performance',
            duration_minutes: 60,
            display_order: 1,
            price: 120,
            artist: {} as ArtistProfile,
          } as Service,
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
    await act(async () => {});
    const servicesTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Services'
    ) as HTMLButtonElement;
    if (servicesTab) {
      await act(async () => {
        servicesTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await act(async () => {});
    }
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
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 2, user_type: 'artist', email: 'a@example.com' } });

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
      client: {
        id: 3,
        email: 'client@example.com',
        user_type: 'client',
        first_name: 'Client',
        last_name: 'User',
        phone_number: '',
        is_active: true,
        is_verified: true,
      } as User,
      service: {
        id: 4,
        artist_id: 2,
        title: 'Service',
        description: 'desc',
        service_type: 'Live Performance',
        duration_minutes: 60,
        display_order: 1,
        price: 100,
        artist: {} as ArtistProfile,
      } as Service,
    }));

    const requests = Array.from({ length: 6 }).map((_, i) => ({
      id: i,
      artist_id: 2,
      client_id: 3,
      service_id: 4,
      created_at: new Date().toISOString(),
      status: 'new',
      artist: {
        id: 2,
        user_id: 2,
        business_name: '',
        user: {
          id: 2,
          email: 'artist@example.com',
          user_type: 'artist',
          first_name: 'Artist',
          last_name: 'User',
          phone_number: '',
          is_active: true,
          is_verified: true,
        },
        created_at: '',
        updated_at: '',
      } as ArtistProfile,
      client: {
        id: 3,
        email: 'client@example.com',
        user_type: 'client',
        first_name: 'Client',
        last_name: 'User',
        phone_number: '',
        is_active: true,
        is_verified: true,
      } as User,
      service: {
        id: 4,
        artist_id: 2,
        title: 'Service',
        description: 'desc',
        service_type: 'Live Performance',
        duration_minutes: 60,
        display_order: 1,
        price: 100,
        artist: {} as ArtistProfile,
      } as Service,
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
    await act(async () => {});
    const servicesTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Services'
    ) as HTMLButtonElement;
    if (servicesTab) {
      await act(async () => {
        servicesTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await act(async () => {});
    }
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    jest.clearAllMocks();
  });

  it('renders booking requests section', () => {
    expect(container.textContent).toContain('Booking Requests');
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
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 2, user_type: 'artist', email: 'a@example.com' } });
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
    await act(async () => {});
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
    expect(card.className).not.toMatch('ring-indigo-400');
    await act(async () => {
      handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(card.className).toMatch('select-none');
    expect(card.className).toMatch('ring-indigo-400');
    await act(async () => {
      handle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    });
    expect(card.className).not.toMatch('select-none');
    expect(card.className).not.toMatch('ring-indigo-400');
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
