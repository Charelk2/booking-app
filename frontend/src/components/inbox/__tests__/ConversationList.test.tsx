import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import ConversationList from '../ConversationList';
import { flushPromises } from '@/test/utils/flush';
import type { BookingRequest } from '@/types';

function renderComponent(props: Partial<React.ComponentProps<typeof ConversationList>> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const defaultProps: React.ComponentProps<typeof ConversationList> = {
    bookingRequests: [],
    selectedRequestId: null,
    onSelectRequest: jest.fn(),
    currentUser: null,
  };
  return { container, root, props: { ...defaultProps, ...props } };
}

describe('ConversationList', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('renders nothing when currentUser is null', async () => {
    const { container, root, props } = renderComponent();
    await act(async () => {
      root.render(<ConversationList {...props} />);
    });
    await flushPromises();
    expect(container.children.length).toBe(0);
    act(() => root.unmount());
    container.remove();
  });

  it('displays conversations when user provided', async () => {
    const requests: BookingRequest[] = [
      {
        id: 1,
        client_id: 1,
        artist_id: 2,
        status: 'pending_quote',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        client: { id: 1, email: 'a', user_type: 'client', first_name: 'A', last_name: 'B', phone_number: '', is_active: true, is_verified: true },
        artist: { id: 2, email: 'b', user_type: 'artist', first_name: 'B', last_name: 'C', phone_number: '', is_active: true, is_verified: true },
      } as BookingRequest,
    ];
    const { container, root, props } = renderComponent({
      bookingRequests: requests,
      currentUser: { id: 1, email: 'a', user_type: 'client', first_name: 'A', last_name: 'B', phone_number: '', is_active: true, is_verified: true },
    });
    await act(async () => {
      root.render(<ConversationList {...props} />);
    });
    await flushPromises();
    expect(container.textContent).toContain('B');
    act(() => root.unmount());
    container.remove();
  });
});
