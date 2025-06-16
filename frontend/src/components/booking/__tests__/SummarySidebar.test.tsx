import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import SummarySidebar from '../SummarySidebar';
import { useBooking } from '@/contexts/BookingContext';

jest.mock('@/contexts/BookingContext');

describe('SummarySidebar', () => {
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
    jest.clearAllMocks();
  });

  it('formats Date objects', () => {
    (useBooking as jest.Mock).mockReturnValue({
      details: {
        date: new Date('2024-01-02T00:00:00Z'),
        time: '10am',
        location: '',
        guests: '20',
        venueType: 'indoor',
        sound: 'yes',
      },
    });
    act(() => {
      root.render(<SummarySidebar />);
    });
    expect(container.textContent).toContain('Jan 2, 2024');
  });

  it('parses ISO strings', () => {
    (useBooking as jest.Mock).mockReturnValue({
      details: {
        date: '2024-05-03',
        time: '9pm',
        location: '',
        guests: '50',
        venueType: 'indoor',
        sound: 'yes',
      },
    });
    act(() => {
      root.render(<SummarySidebar />);
    });
    expect(container.textContent).toContain('May 3, 2024');
    expect(container.textContent).toContain('50');
  });
});
