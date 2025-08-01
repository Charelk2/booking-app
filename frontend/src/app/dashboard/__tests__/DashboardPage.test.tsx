import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import { flushPromises } from '@/test/utils/flush';
import { formatCurrency } from '@/lib/utils';
import { waitFor } from '@testing-library/react';
import DashboardPage from '../page';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArtistProfile, User, Service, BookingRequest } from '@/types';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(() => '/dashboard'),
  useSearchParams: jest.fn(),
}));



if (typeof global.PointerEvent === 'undefined') {
  // @ts-expect-error - jsdom lacks PointerEvent so we fall back to MouseEvent
  global.PointerEvent = window.MouseEvent;
}

beforeEach(() => {
  (useSearchParams as jest.Mock).mockReturnValue({ get: () => null });
});

describe('DashboardPage empty state', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useSearchParams as jest.Mock).mockReturnValue({ get: () => null });
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: 'client', email: 'c@example.com' } });
    (api.getMyClientBookings as jest.Mock).mockResolvedValue({ data: [] });
    (api.getMyBookingRequests as jest.Mock).mockResolvedValue({ data: [] });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<DashboardPage />);
    });
    await act(async () => {
      await flushPromises();
    });
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
    act(() => {
      root.unmount();
    });
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
    (useSearchParams as jest.Mock).mockReturnValue({ get: () => null });
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
    (api.getArtistProfileMe as jest.Mock).mockResolvedValue({
      data: {
        business_name: 'Studio',
        description: 'desc',
        location: 'City',
        profile_picture_url: 'pic',
        cover_photo_url: 'cover',
      },
    });
    (api.getBookingRequestsForArtist as jest.Mock).mockResolvedValue({ data: [] });
    (api.getDashboardStats as jest.Mock).mockResolvedValue({
      data: { monthly_new_inquiries: 3, profile_views: 5, response_rate: 50 },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<DashboardPage />);
    });
    await waitFor(() => expect(api.getArtistServices).toHaveBeenCalled());
    const servicesTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Services'
    ) as HTMLButtonElement;
    if (servicesTab) {
      await act(async () => {
        servicesTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await act(async () => {
      await flushPromises();
    });
    }
    const requestsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Requests'
    ) as HTMLButtonElement;
    if (requestsTab) {
      await act(async () => {
        requestsTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await act(async () => {
      await flushPromises();
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

  it('renders monthly earnings card', () => {
    expect(container.textContent).toContain('Earnings This Month');
    expect(container.textContent).toContain(formatCurrency(120));
  });


  it('renders new dashboard metrics', () => {
    expect(container.textContent).toContain('New Inquiries');
    expect(container.textContent).toContain('3');
    expect(container.textContent).toContain('Profile Views');
    expect(container.textContent).toContain('5');
  });

  it('shows profile progress bar', () => {
    const bar = container.querySelector(
      '[data-testid="profile-progress"] .progress-bar-fill'
    ) as HTMLDivElement;
    expect(bar.style.width).toBe('100%');

  });
});

describe('DashboardPage client stats', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useSearchParams as jest.Mock).mockReturnValue({ get: () => null });
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 3, user_type: 'client', email: 'c@example.com' } });
    (api.getMyClientBookings as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
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
        },
      ],
    });
    (api.getMyBookingRequests as jest.Mock).mockResolvedValue({ data: [] });

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

  it('hides earnings cards for clients', () => {
    expect(container.textContent).not.toContain('Total Earnings');
    expect(container.textContent).not.toContain('Earnings This Month');
  });
});

describe('DashboardPage list toggles', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useSearchParams as jest.Mock).mockReturnValue({ get: () => null });
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
    await act(async () => {
      await flushPromises();
    });
    const servicesTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Services'
    ) as HTMLButtonElement;
    if (servicesTab) {
      await act(async () => {
        servicesTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await act(async () => {
      await flushPromises();
    });
    }
    const requestsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Requests'
    ) as HTMLButtonElement;
    if (requestsTab) {
      await act(async () => {
        requestsTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await act(async () => {
      await flushPromises();
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

  it('renders booking requests section', () => {
    expect(container.textContent).toContain('Recent Booking Requests');
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
    await act(async () => {
      await flushPromises();
    });
    const servicesTab = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Services') as HTMLButtonElement;
    if (servicesTab) {
      await act(async () => {
        servicesTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await act(async () => {
        await flushPromises();
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

  it('renders a drag handle', async () => {
    await act(async () => {
      await flushPromises();
    });
    const card = container.querySelector('[data-testid="service-item"]') as HTMLElement;
    const handle = card.querySelector('div[aria-hidden="true"]');
    expect(handle).toBeTruthy();
  });
});

describe('DashboardPage bookings link', () => {
  it('shows link to all bookings when more than five exist', async () => {
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
      client: { first_name: 'C', last_name: String(i) },
      service: { title: 'Service' },
    }));
    (api.getMyArtistBookings as jest.Mock).mockResolvedValue({ data: bookings });
    (api.getArtistServices as jest.Mock).mockResolvedValue({ data: [] });
    (api.getArtistProfileMe as jest.Mock).mockResolvedValue({ data: {} });
    (api.getBookingRequestsForArtist as jest.Mock).mockResolvedValue({ data: [] });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<DashboardPage />);
    });
    await act(async () => {
      await flushPromises();
    });
    const bookingsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Bookings'
    ) as HTMLButtonElement;
    if (bookingsTab) {
      await act(async () => {
        bookingsTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await act(async () => {
      await flushPromises();
    });
    }
    const link = container.querySelector('a[href="/dashboard/bookings"]');
    expect(link).toBeTruthy();
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});

describe('DashboardPage booking requests load more', () => {
  it('loads more requests when button clicked', async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 2, user_type: 'artist', email: 'a@example.com' } });
    const requests = Array.from({ length: 6 }).map((_, i) => ({
      id: i,
      client_id: 3,
      artist_id: 2,
      status: 'pending_artist_confirmation',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      quotes: [],
      client: { first_name: 'C', last_name: String(i) },
      artist: { first_name: 'A', last_name: 'B' },
    }));
    (api.getMyArtistBookings as jest.Mock).mockResolvedValue({ data: [] });
    (api.getArtistServices as jest.Mock).mockResolvedValue({ data: [] });
    (api.getArtistProfileMe as jest.Mock).mockResolvedValue({ data: {} });
    (api.getBookingRequestsForArtist as jest.Mock).mockResolvedValue({ data: requests });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<DashboardPage />);
    });
    await act(async () => {
      await flushPromises();
    });
    const requestsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Requests'
    ) as HTMLButtonElement;
    if (requestsTab) {
      await act(async () => {
        requestsTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await act(async () => {
      await flushPromises();
    });
    }
    const list = container.querySelectorAll('li');
    expect(list.length).toBe(5);
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Load More'),
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    await act(async () => {
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await flushPromises();
    });
    const updated = container.querySelectorAll('li');
    expect(updated.length).toBe(6);
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});

describe('DashboardPage accepted quote label', () => {
  it('shows quote accepted link when a request has an accepted quote', async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: 'client', email: 'c@example.com' } });
    (api.getMyClientBookings as jest.Mock).mockResolvedValue({ data: [] });
    (api.getMyBookingRequests as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          client_id: 1,
          artist_id: 2,
          status: 'pending_artist_confirmation',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          accepted_quote_id: 42,
          quotes: [],
          artist: { first_name: 'A', last_name: 'B' },
        },
      ],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<DashboardPage />);
    });
    await act(async () => {
      await flushPromises();
    });

    const link = container.querySelector('a[href="/quotes/42"]');
    expect(link).toBeTruthy();

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});

describe('DashboardPage quotes link', () => {
  it('shows link to artist quotes', async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 2, user_type: 'artist', email: 'a@example.com' } });
    (api.getMyArtistBookings as jest.Mock).mockResolvedValue({ data: [] });
    (api.getArtistServices as jest.Mock).mockResolvedValue({ data: [] });
    (api.getArtistProfileMe as jest.Mock).mockResolvedValue({ data: {} });
    (api.getBookingRequestsForArtist as jest.Mock).mockResolvedValue({ data: [] });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<DashboardPage />);
    });
    await act(async () => {
      await flushPromises();
    });

    const link = container.querySelector('a[href="/dashboard/quotes"]');
    expect(link).toBeTruthy();
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});


describe('DashboardPage request updates', () => {
  it('updates request status when form submitted', async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 2, user_type: 'artist', email: 'a@example.com' } });
    const req = {
      id: 1,
      client_id: 3,
      artist_id: 2,
      status: 'pending_quote',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      client: { first_name: 'C', last_name: 'U' },
      service: { title: 'Show' },
    } as BookingRequest;
    (api.getMyArtistBookings as jest.Mock).mockResolvedValue({ data: [] });
    (api.getArtistServices as jest.Mock).mockResolvedValue({ data: [] });
    (api.getArtistProfileMe as jest.Mock).mockResolvedValue({ data: {} });
    (api.getBookingRequestsForArtist as jest.Mock).mockResolvedValue({ data: [req] });
    (api.updateBookingRequestArtist as jest.Mock).mockResolvedValue({ data: { ...req, status: 'request_declined' } });
    (api.postMessageToBookingRequest as jest.Mock).mockResolvedValue({});

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<DashboardPage />);
    });
    await act(async () => {
      await flushPromises();
    });

    const updateBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Update') as HTMLButtonElement;
    expect(updateBtn).toBeTruthy();
    await act(async () => {
      updateBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await flushPromises();
    });
    const select = container.querySelector('select#status') as HTMLSelectElement;
    const textarea = container.querySelector('textarea#note') as HTMLTextAreaElement;
    act(() => {
      select.value = 'request_declined';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      textarea.value = 'sorry';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const save = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Save') as HTMLButtonElement;
    await act(async () => {
      save.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await flushPromises();
    });

    expect(api.updateBookingRequestArtist).toHaveBeenCalledWith(1, { status: 'request_declined' });
    expect(container.textContent).toContain('Request Declined');

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
