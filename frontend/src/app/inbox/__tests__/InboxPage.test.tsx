import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import InboxPage from '../page';
import * as api from '@/lib/api';
import { useRouter, usePathname, useSearchParams } from '@/tests/mocks/next-navigation';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('@/lib/api');
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
jest.mock('@/components/chat/MessageThreadWrapper', () => {
  const Mock = () => <div />;
  Mock.displayName = 'MockMessageThreadWrapper';
  return { __esModule: true, default: Mock };
});
jest.mock('@/hooks/useWebSocket', () => ({
  __esModule: true,
  default: () => ({ onMessage: jest.fn() }),
}));

function setup(userType: 'client' | 'artist' = 'client', width = 1024) {
  window.innerWidth = width;
  useRouter.mockReturnValue({ replace: jest.fn() });
  usePathname.mockReturnValue('/inbox');
  useSearchParams.mockReturnValue(new URLSearchParams());
  (useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: userType }, loading: false });
  (api.getMyBookingRequests as jest.Mock).mockResolvedValue({
    data: [
      {
        id: 1,
        client_id: 1,
        artist_id: 2,
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
        last_message_timestamp: '2024-01-03',
        last_message_content: 'Hello',
      },
    ],
  });
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
    const { container, root } = setup('client', 1024);
    await act(async () => {
      root.render(<InboxPage />);
    });
    await act(async () => {});
    expect(container.textContent).toContain('Service Provider');
    expect(api.getMyBookingRequests).toHaveBeenCalledTimes(1);
    expect(api.getBookingRequestsForArtist).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });

  it('fetches artist requests for artist users', async () => {
    const { container, root } = setup('artist', 1024);
    await act(async () => {
      root.render(<InboxPage />);
    });
    await act(async () => {});
    expect(api.getMyBookingRequests).toHaveBeenCalledTimes(1);
    expect(api.getBookingRequestsForArtist).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    container.remove();
  });

  it('sorts conversations by last message', async () => {
    (api.getMyBookingRequests as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          client_id: 1,
          artist_id: 2,
          created_at: '2024-01-01',
          updated_at: '2024-01-02',
          last_message_timestamp: '2024-01-05',
          artist: { first_name: 'Alpha' },
        },
        {
          id: 2,
          client_id: 1,
          artist_id: 3,
          created_at: '2024-01-01',
          updated_at: '2024-01-02',
          last_message_timestamp: '2024-01-03',
          artist: { first_name: 'Beta' },
        },
      ],
    });

    const { container, root } = setup('client', 1024);
    await act(async () => {
      root.render(<InboxPage />);
    });
    await act(async () => {});
    const firstConv = container.querySelector('.divide-y-2 > div:nth-child(1) span');
    expect(firstConv?.textContent).toBe('Alpha');
    act(() => root.unmount());
    container.remove();
  });

  it('shows only conversation list on mobile until a conversation is selected', async () => {
    const { container, root } = setup('client', 375);
    await act(async () => {
      root.render(<InboxPage />);
    });
    await act(async () => {});
    expect(container.querySelector('#chat-thread')).toBeNull();
    const firstConv = container.querySelector('.divide-y-2 > div:nth-child(1)') as HTMLElement;
    await act(async () => {
      firstConv.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {});
    expect(container.querySelector('#conversation-list')).toBeNull();
    expect(container.querySelector('#chat-thread')).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });
});
