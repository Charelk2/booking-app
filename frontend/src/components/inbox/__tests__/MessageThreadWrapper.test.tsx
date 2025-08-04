import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import MessageThreadWrapper from '../MessageThreadWrapper';
import * as api from '@/lib/api';

jest.mock('@/lib/api');

jest.mock('../BookingDetailsPanel', () => {
  const Mock = () => <div />;
  Mock.displayName = 'MockBookingDetailsPanel';
  return { __esModule: true, default: Mock };
});

jest.mock('@/components/booking/MessageThread', () => {
  const Mock = () => <div />;
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

function setup(userType: 'client' | 'artist') {
  (api.useAuth as jest.Mock).mockReturnValue({ user: { id: 99, user_type: userType }, loading: false });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
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
});
