import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import InboxPage from '../page';
import * as api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('@/lib/api');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(() => '/inbox'),
}));
jest.mock('@/components/layout/MainLayout', () => {
  const Mock = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Mock.displayName = 'MockMainLayout';
  return Mock;
});
jest.mock('@/components/review/ReviewFormModal', () => {
  const Mock = () => <div />;
  Mock.displayName = 'MockReviewFormModal';
  return { __esModule: true, default: Mock };
});

function setup(userType: 'client' | 'artist' = 'client') {
  (useRouter as jest.Mock).mockReturnValue({ replace: jest.fn() });
  (useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: userType }, loading: false });
  (api.getMyBookingRequests as jest.Mock).mockResolvedValue({ data: [{ id: 1, client_id: 1, artist_id: 2, created_at: '2024-01-01', updated_at: '2024-01-02' }] });
  (api.getBookingRequestsForArtist as jest.Mock).mockResolvedValue({ data: [] });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

describe('InboxPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders conversation list', async () => {
    const { container, root } = setup();
    await act(async () => {
      root.render(<InboxPage />);
    });
    await act(async () => {});
    expect(container.textContent).toContain('Artist');
    expect(api.getMyBookingRequests).toHaveBeenCalledTimes(1);
    expect(api.getBookingRequestsForArtist).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });

  it('fetches artist requests for artist users', async () => {
    const { container, root } = setup('artist');
    await act(async () => {
      root.render(<InboxPage />);
    });
    await act(async () => {});
    expect(api.getMyBookingRequests).toHaveBeenCalledTimes(1);
    expect(api.getBookingRequestsForArtist).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    container.remove();
  });
});
