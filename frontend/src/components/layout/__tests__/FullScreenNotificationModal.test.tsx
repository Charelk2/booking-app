import { flushPromises, nextTick } from "@/test/utils/flush";
import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import FullScreenNotificationModal from '../FullScreenNotificationModal';


const baseProps = {
  open: true,
  onClose: () => {},
  items: [],
  onItemClick: jest.fn(),
  markAllRead: jest.fn(),
  loadMore: jest.fn(),
  hasMore: false,
};

describe('FullScreenNotificationModal', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows empty state message', () => {
    act(() => {
      root.render(React.createElement(FullScreenNotificationModal, baseProps));
    });
    expect(document.body.textContent).toContain("You're all caught up!");
  });

  it('renders mark all button', () => {
    act(() => {
      root.render(React.createElement(FullScreenNotificationModal, baseProps));
    });
    expect(document.body.textContent).toContain('Mark All as Read');
  });

  it('shows error message when provided', async () => {
    await act(async () => {
      root.render(
        React.createElement(FullScreenNotificationModal, {
          ...baseProps,
          error: new Error('Failed to load'),
        }),
      );
    });
    await flushPromises();
    const err = document.querySelector('[data-testid="notification-error"]');
    expect(err?.textContent).toBe('Failed to load');
  });

});
