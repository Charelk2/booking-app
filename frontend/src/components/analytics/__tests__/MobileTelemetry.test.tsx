import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { Metric } from 'web-vitals';
import MobileTelemetry from '../MobileTelemetry';
import { trackEvent } from '@/lib/analytics';

jest.mock('@/lib/analytics', () => ({
  trackEvent: jest.fn(),
}));

jest.mock('web-vitals/attribution', () => ({
  onLCP: (cb: (metric: Metric) => void) => cb({ name: 'LCP', value: 3000 } as Metric),
  onINP: (cb: (metric: Metric) => void) => cb({ name: 'INP', value: 250 } as Metric),
}));

describe('MobileTelemetry', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(() => ({
        matches: true,
        media: '(pointer: coarse)',
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  it('reports web vitals and rage taps', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<MobileTelemetry />);
    });

    // Three taps in the same spot on a disabled button
    const button = document.createElement('button');
    button.disabled = true;
    document.body.appendChild(button);
    act(() => {
      const event = new MouseEvent('click', {
        clientX: 10,
        clientY: 10,
        bubbles: true,
      });
      button.dispatchEvent(event);
      button.dispatchEvent(event);
      button.dispatchEvent(event);
    });

    expect(trackEvent).toHaveBeenCalledWith(
      'web_vital_slo_violation',
      expect.objectContaining({ name: 'LCP' }),
    );
    expect(trackEvent).toHaveBeenCalledWith(
      'web_vital_slo_violation',
      expect.objectContaining({ name: 'INP' }),
    );
    expect(trackEvent).toHaveBeenCalledWith('rage_tap', expect.any(Object));
    expect(trackEvent).toHaveBeenCalledWith('tap_error', expect.any(Object));

    act(() => {
      root.unmount();
    });
    button.remove();
    container.remove();
  });
});
