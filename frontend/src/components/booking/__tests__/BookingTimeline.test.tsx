import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import BookingTimeline from '../BookingTimeline';

function renderTimeline(status: string) {
  const div = document.createElement('div');
  const root = createRoot(div);
  act(() => {
    root.render(<BookingTimeline status={status} />);
  });
  return { div, root };
}

describe('BookingTimeline component', () => {
  it('highlights Artist Reviewing for pending_quote', () => {
    const { div, root } = renderTimeline('pending_quote');
    const items = div.querySelectorAll('[role="listitem"]');
    expect(items).toHaveLength(4);
    expect(items[1].getAttribute('aria-current')).toBe('step');
    act(() => {
      root.unmount();
    });
    div.remove();
  });

  it('highlights Quote Sent for quote_provided', () => {
    const { div, root } = renderTimeline('quote_provided');
    const items = div.querySelectorAll('[role="listitem"]');
    expect(items[2].getAttribute('aria-current')).toBe('step');
    act(() => {
      root.unmount();
    });
    div.remove();
  });

  it('shows final step for request_confirmed', () => {
    const { div, root } = renderTimeline('request_confirmed');
    const items = div.querySelectorAll('[role="listitem"]');
    expect(items[3].getAttribute('aria-current')).toBe('step');
    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
