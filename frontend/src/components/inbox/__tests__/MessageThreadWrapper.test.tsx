import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import MessageThreadWrapper from '@/components/chat/MessageThreadWrapper';
import * as api from '@/lib/api';
import { useRouter } from '@/tests/mocks/next-navigation';
import type { BookingRequest, ServiceProviderProfile } from '@/types';

jest.mock('@/lib/api');

jest.mock('@/components/chat/BookingDetailsPanel', () => {
  const Mock = () => <div />;
  Mock.displayName = 'MockBookingDetailsPanel';
  return { __esModule: true, default: Mock };
});

jest.mock('@/components/chat/MessageThread', () => {
  const Mock = jest.fn(() => <div />);
  Mock.displayName = 'MockMessageThread';
  return { __esModule: true, default: Mock };
});

jest.mock('@/hooks/usePaymentModal', () => ({
  __esModule: true,
  default: () => ({ openPaymentModal: jest.fn(), paymentModal: null }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}));


const bookingRequest: Partial<BookingRequest> = {
  id: 1,
  artist: {
    id: 2,
    first_name: 'Art',
    business_name: 'ArtistBiz',
    user: { first_name: 'Art' },
    profile_picture_url: null,
  },
  client: {
    id: 3,
    first_name: 'Client',
    profile_picture_url: null,
  },
  artist_profile: { business_name: 'ArtistBiz' } as Partial<ServiceProviderProfile>,
};

function setup(userType: 'client' | 'artist') {
  (api.useAuth as jest.Mock).mockReturnValue({ user: { id: 99, user_type: userType }, loading: false });
  const router = { replace: jest.fn(), back: jest.fn() };
  (useRouter as jest.Mock).mockReturnValue(router);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root, router };
}

describe('MessageThreadWrapper', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows artist name to client users', async () => {
    const { container, root } = setup('client');
    await act(async () => {
      root.render(
        <MessageThreadWrapper
          bookingRequestId={1}
          bookingRequest={bookingRequest as BookingRequest}
          setShowReviewModal={() => {}}
        />,
      );
    });
    await act(async () => {});
    const header = container.querySelector('header span');
    expect(header?.textContent).toContain('ArtistBiz');
    act(() => root.unmount());
    container.remove();
  });

  it('shows client name to artist users', async () => {
    const { container, root } = setup('artist');
    await act(async () => {
      root.render(
        <MessageThreadWrapper
          bookingRequestId={1}
          bookingRequest={bookingRequest as BookingRequest}
          setShowReviewModal={() => {}}
        />,
      );
    });
    await act(async () => {});
    const header = container.querySelector('header span');
    expect(header?.textContent).toContain('ArtistBiz');
    act(() => root.unmount());
    container.remove();
  });

  it('starts with booking details hidden', async () => {
    const { container, root } = setup('client');
    await act(async () => {
      root.render(
        <MessageThreadWrapper
          bookingRequestId={1}
          bookingRequest={bookingRequest as BookingRequest}
          setShowReviewModal={() => {}}
        />,
      );
    });
    await act(async () => {});
    const showButton = container.querySelector('button[aria-label="Show booking details"]');
    const hideButton = container.querySelector('button[aria-label="Hide details panel"]');
    expect(showButton).not.toBeNull();
    expect(hideButton).toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it('fills width on mobile screens', async () => {
    (globalThis as { innerWidth: number }).innerWidth = 500;
    const { container, root } = setup('client');
    await act(async () => {
      root.render(
        <MessageThreadWrapper
          bookingRequestId={1}
          bookingRequest={bookingRequest as BookingRequest}
          setShowReviewModal={() => {}}
        />,
      );
    });
    await act(async () => {});
    const thread = container.querySelector('[data-testid="thread-container"]');
    expect(thread?.className).toContain('w-full');
    act(() => root.unmount());
    container.remove();
  });

  it('closes details panel on browser back before leaving thread', async () => {
    (globalThis as { innerWidth: number }).innerWidth = 500;
    const { container, root, router } = setup('client');
    await act(async () => {
      root.render(
        <MessageThreadWrapper
          bookingRequestId={1}
          bookingRequest={bookingRequest as BookingRequest}
          setShowReviewModal={() => {}}
        />,
      );
    });
    await act(async () => {});
    const toggle = container.querySelector('button[aria-label="Show booking details"]');
    expect(toggle).not.toBeNull();
    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await act(async () => {});
    const closedToggle = container.querySelector('button[aria-label="Show booking details"]');
    expect(closedToggle).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });
});
