import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import BookingRequestIcon from './BookingRequestIcon';
import useNotifications from '@/hooks/useNotifications';

jest.mock('next/link', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

jest.mock('@/hooks/useNotifications');

describe('BookingRequestIcon accessibility', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('applies ring styles when keyboard focused', () => {
    (useNotifications as jest.Mock).mockReturnValue({ items: [] });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<BookingRequestIcon />);
    });
    const link = container.querySelector('a');
    if (link) {
      act(() => {
        link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        (link as HTMLElement).focus();
      });
      expect(link.className).toContain('focus-visible:ring-2');
      expect(link.className).toContain('focus-visible:ring-brand');
    } else {
      throw new Error('Link not found');
    }
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
