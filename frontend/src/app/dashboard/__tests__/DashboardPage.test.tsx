import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import DashboardPage from '../page';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

function mockRequests(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    client: { first_name: 'A', last_name: 'B' },
    artist: { first_name: 'A', last_name: 'B' },
    service: { title: 'S' },
    status: 'pending',
    created_at: new Date().toISOString(),
  }));
}

describe('DashboardPage booking requests toggle', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: 'artist' } });
    (api.getMyArtistBookings as jest.Mock).mockResolvedValue({ data: [] });
    (api.getArtistServices as jest.Mock).mockResolvedValue({ data: [] });
    (api.getArtistProfileMe as jest.Mock).mockResolvedValue({ data: {} });
    (api.getBookingRequestsForArtist as jest.Mock).mockResolvedValue({ data: mockRequests(7) });
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(DashboardPage));
    });
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    jest.clearAllMocks();
  });

  it('collapses and expands the booking request list', async () => {
    expect(container.querySelectorAll('tbody tr').length).toBe(5);
    const btn = container.querySelector('button[data-testid="requests-toggle"]') as HTMLButtonElement;
    expect(btn.textContent).toBe('Show All');

    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelectorAll('tbody tr').length).toBe(7);
    expect(btn.textContent).toBe('Collapse');
  });
});
