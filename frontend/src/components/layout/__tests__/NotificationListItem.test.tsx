import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import NotificationListItem from '../NotificationListItem';
import type { UnifiedNotification } from '@/types';

const baseNotification: UnifiedNotification = {
  type: 'message',
  timestamp: new Date().toISOString(),
  is_read: false,
  content: 'New message: Hi',
  booking_request_id: 1,
  name: 'Alice',
} as UnifiedNotification;

describe('NotificationListItem', () => {
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

  it('sets title attribute to parsed title', () => {
    act(() => {
      root.render(
        React.createElement(NotificationListItem, {
          n: baseNotification,
          onClick: () => {},
        }),
      );
    });
    const span = container.querySelector('span[title]');
    expect(span?.getAttribute('title')).toBe('Alice');
  });
});
