import { flushPromises } from "@/test/utils/flush";
import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import BookingPage from '../page';
import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams, useRouter, usePathname } from '@/tests/mocks/next-navigation';
jest.mock('@/contexts/AuthContext');
jest.mock('@/components/booking/BookingWizard', () => () => <div>Date & Time</div>);


interface AuthValue {
  user: unknown;
  loading: boolean;
}

const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

function setup(authValue: AuthValue, searchParams: Record<string, string> = {}) {
  (useAuth as jest.Mock).mockReturnValue(authValue);
  useRouter.mockReturnValue({ push: jest.fn(), pathname: '/booking' });
  usePathname.mockReturnValue('/booking');
  useSearchParams.mockReturnValue({
    get: (key: string) => searchParams[key] || null,
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

describe('BookingPage auth flow', () => {
  beforeEach(() => {
    (global as any).fetch = mockFetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('prompts to login when user is missing', async () => {
    const { container, root } = setup({ user: null, loading: false });
    await act(async () => {
      root.render(<BookingPage />);
    });
    expect(container.textContent).toContain('log in');
    const link = container.querySelector('a[href="/login"]');
    expect(link).toBeTruthy();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders booking wizard when authenticated', async () => {
    const { container, root } = setup(
      { user: { id: 1, email: 't@example.com' }, loading: false },
      { artist_id: '1' }
    );
    await act(async () => {
      root.render(<BookingPage />);
    });
    await flushPromises();
    expect(container.textContent).toContain('Date & Time');
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
