import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import MessageThreadWrapper from '../MessageThreadWrapper';
import * as api from '@/lib/api';
import { useSearchParams, useRouter } from 'next/navigation';

jest.mock('@/lib/api');

jest.mock('../BookingDetailsPanel', () => {
  const Mock = () => <div />;
  Mock.displayName = 'MockBookingDetailsPanel';
  return { __esModule: true, default: Mock };
});

jest.mock('@/components/booking/MessageThread', () => {
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
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />,
}));

jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(),
  useRouter: jest.fn(),
}));

const bookingRequest = {
  id: 1,
  artist: {
    id: 2,
    business_name: 'ArtistBiz',
    user: { first_name: 'Art' },
    profile_picture_url: null,
  },
  client: {
    id: 3,
    first_name: 'Client',
    profile_picture_url: null,
  },
};

function setup(userType: 'client' | 'artist', params = '') {
  (api.useAuth as jest.Mock).mockReturnValue({ user: { id: 99, user_type: userType }, loading: false });
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(params));
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
        <MessageThreadWrapper bookingRequestId={1} bookingRequest={bookingRequest as any} setShowReviewModal={() => {}} />,
      );
    });
    await act(async () => {});
    const header = container.querySelector('header span');
    expect(header?.textContent).toBe('Chat with ArtistBiz');
    act(() => root.unmount());
    container.remove();
  });

  it('shows client name to artist users', async () => {
    const { container, root } = setup('artist');
    await act(async () => {
      root.render(
        <MessageThreadWrapper bookingRequestId={1} bookingRequest={bookingRequest as any} setShowReviewModal={() => {}} />,
      );
    });
    await act(async () => {});
    const header = container.querySelector('header span');
    expect(header?.textContent).toBe('Chat with Client');
    act(() => root.unmount());
    container.remove();
  });

  it('starts with booking details hidden', async () => {
    const { container, root } = setup('client');
    await act(async () => {
      root.render(
        <MessageThreadWrapper bookingRequestId={1} bookingRequest={bookingRequest as any} setShowReviewModal={() => {}} />,
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

  it('opens quote modal when sendQuote param is present', async () => {
    const { container, root } = setup('artist', 'sendQuote=1');
    const MessageThreadMock = require('../MessageThread').default as jest.Mock;
    await act(async () => {
      root.render(
        <MessageThreadWrapper bookingRequestId={1} bookingRequest={bookingRequest as any} setShowReviewModal={() => {}} />,
      );
    });
    await act(async () => {});
    expect(MessageThreadMock).toHaveBeenCalledWith(
      expect.objectContaining({ showQuoteModal: true }),
      expect.anything(),
    );
    act(() => root.unmount());
    container.remove();
  });

  it('fills width on mobile screens', async () => {
    (global as any).innerWidth = 500;
    const { container, root } = setup('client');
    await act(async () => {
      root.render(
        <MessageThreadWrapper bookingRequestId={1} bookingRequest={bookingRequest as any} setShowReviewModal={() => {}} />,
      );
    });
    await act(async () => {});
    const thread = container.querySelector('[data-testid="thread-container"]');
    expect(thread?.className).toContain('w-full');
    act(() => root.unmount());
    container.remove();
  });

  it('closes details panel on browser back before leaving thread', async () => {
    (global as any).innerWidth = 500;
    const { container, root, router } = setup('client');
    await act(async () => {
      root.render(
        <MessageThreadWrapper bookingRequestId={1} bookingRequest={bookingRequest as any} setShowReviewModal={() => {}} />,
      );
    });
    await act(async () => {});
    const toggle = container.querySelector('button[aria-label="Show details"]');
    expect(toggle).not.toBeNull();
    await act(async () => {
      (toggle as HTMLButtonElement).click();
    });
    await act(async () => {});
    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await act(async () => {});
    const closedToggle = container.querySelector('button[aria-label="Show details"]');
    expect(closedToggle).not.toBeNull();
    expect(router.back).not.toHaveBeenCalled();
    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(router.back).toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });
});
