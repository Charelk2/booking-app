import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import ReviewStep from '../ReviewStep';
import { useBooking } from '@/contexts/BookingContext';
import { calculateQuote, getService } from '@/lib/api';
import { geocodeAddress, calculateDistanceKm } from '@/lib/geo';

jest.mock('@/contexts/BookingContext');
jest.mock('@/lib/api');
jest.mock('@/lib/geo');

describe('ReviewStep summary', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    (getService as jest.Mock).mockResolvedValue({ data: { price: 100 } });
    (calculateQuote as jest.Mock).mockResolvedValue({ data: { total: 150 } });
    (geocodeAddress as jest.Mock).mockResolvedValue({ lat: 0, lng: 0 });
    (calculateDistanceKm as jest.Mock).mockReturnValue(10);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.clearAllMocks();
  });

  it('renders single summary and price', async () => {
    (useBooking as jest.Mock).mockReturnValue({
      details: { location: 'a', eventType: 'Party', eventDescription: 'Fun' },
    });
    await act(async () => {
      root.render(
        <ReviewStep
          step={0}
          steps={['Review']}
          onBack={() => {}}
          onSaveDraft={async () => {}}
          onNext={async () => {}}
          submitting={false}
          serviceId={1}
          artistLocation="b"
        />,
      );
    });
    expect(container.querySelectorAll('h3').length).toBe(1);
    expect(container.textContent).toContain('Estimated Price');
  });
});
