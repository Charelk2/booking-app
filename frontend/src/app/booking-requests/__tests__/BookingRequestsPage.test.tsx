import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import BookingRequestsPage from '../page';
import * as api from '@/lib/api';
import useNotifications from '@/hooks/useNotifications';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('@/lib/api');
jest.mock('@/hooks/useNotifications');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(() => '/booking-requests'),
}));
jest.mock('@/contexts/AuthContext');
jest.mock('@/components/layout/MainLayout', () => {
  const Mock = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Mock.displayName = 'MockMainLayout';
  return Mock;
});

function setup() {
  (useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: 'client' } });
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
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
  });
  (api.getMyBookingRequests as jest.Mock).mockResolvedValue({
    data: [
      {
        id: 1,
        client_id: 1,
        artist_id: 2,
        status: 'new',
        proposed_datetime_1: '2025-06-10T12:00:00Z',
        created_at: '',
        updated_at: '',
        client: { first_name: 'Alice', last_name: 'A' },
        service: { service_type: 'Live Performance' },
      },
      {
        id: 2,
        client_id: 2,
        artist_id: 2,
        status: 'pending_quote',
        proposed_datetime_1: '2025-06-11T12:00:00Z',
        created_at: '',
        updated_at: '',
        client: { first_name: 'Bob', last_name: 'B' },
        service: { service_type: 'Custom Song' },
      },
    ],
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
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
    await act(async () => {
      await Promise.resolve();
    });
    const aliceHeader = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Alice A'),
    ) as HTMLButtonElement;
    if (aliceHeader) {
      act(() => {
        aliceHeader.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }
    await act(async () => {
      await Promise.resolve();
    });
    const aliceRow = container.querySelector('li[data-request-id="1"]');
    expect(aliceRow?.className).toContain('bg-indigo-50');
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
    await act(async () => {
      await Promise.resolve();
    });
    const input = container.querySelector(
      'input[aria-label="Search by client name"]',
    ) as HTMLInputElement;
    act(() => {
      input.value = 'Bob';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    const bobHeader = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Bob B'),
    );
    expect(bobHeader).toBeTruthy();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('sets aria attributes on toggle buttons', async () => {
    const { container, root } = setup();
    await act(async () => {
      root.render(<BookingRequestsPage />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const aliceHeader = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Alice A'),
    ) as HTMLButtonElement;
    expect(aliceHeader?.getAttribute('aria-controls')).toBe('requests-1');
    expect(aliceHeader?.getAttribute('aria-expanded')).toBe('false');
    if (aliceHeader) {
      act(() => {
        aliceHeader.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }
    await act(async () => {
      await Promise.resolve();
    });
    expect(aliceHeader?.getAttribute('aria-expanded')).toBe('true');
    const list = container.querySelector('#requests-1');
    expect(list).toBeTruthy();
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
