import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import NotificationCard from '../NotificationCard';

describe('NotificationCard', () => {
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

  it('uses default avatar when none provided', () => {
    act(() => {
      root.render(
        React.createElement(NotificationCard, {
          type: 'reminder',
          from: 'Jane Doe',
          createdAt: new Date().toISOString(),
          unread: true,
          onClick: () => {},
        }),
      );
    });
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toContain('/static/default-avatar.svg');
  });

  it('applies unread styling', () => {
    act(() => {
      root.render(
        React.createElement(NotificationCard, {
          type: 'confirmed',
          from: 'John',
          createdAt: new Date().toISOString(),
          unread: true,
          onClick: () => {},
        }),
      );
    });
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('border-brand');
  });

  it('fires onClick when clicked', () => {
    const onClick = jest.fn();
    act(() => {
      root.render(
        React.createElement(NotificationCard, {
          type: 'due',
          from: 'Bob',
          createdAt: new Date().toISOString(),
          unread: false,
          onClick,
        }),
      );
    });
    const card = container.firstChild as HTMLElement;
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClick).toHaveBeenCalled();
  });

  it('uses color coded icon for status', () => {
    act(() => {
      root.render(
        React.createElement(NotificationCard, {
          type: 'confirmed',
          from: 'Status',
          createdAt: new Date().toISOString(),
          unread: false,
          onClick: () => {},
        }),
      );
    });
    const icon = container.querySelector('svg.text-green-600');
    expect(icon).not.toBeNull();
  });
});
