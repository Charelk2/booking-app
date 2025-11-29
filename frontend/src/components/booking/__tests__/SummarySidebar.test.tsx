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
        eventType: 'Wedding',
        eventDescription: 'A small ceremony',
        location: '',
        guests: '20',
        venueType: 'indoor',
        sound: 'yes',
      },
      travelResult: null,
      setTravelResult: jest.fn(),
    });
    act(() => {
      root.render(<SummarySidebar />);
    });
    expect(container.textContent).not.toContain('January 2nd, 2024');
    const button = container.querySelector('button');
    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('January 2nd, 2024');
    expect(container.textContent).toContain('Wedding');
    expect(container.textContent).toContain('A small ceremony');
  });

  it('parses ISO strings', () => {
    (useBooking as jest.Mock).mockReturnValue({
      details: {
        date: '2024-05-03',
        time: '9pm',
        eventType: 'Corporate',
        eventDescription: 'Year end function',
        location: '',
        guests: '50',
        venueType: 'indoor',
        sound: 'yes',
      },
      travelResult: null,
      setTravelResult: jest.fn(),
    });
    act(() => {
      root.render(<SummarySidebar />);
    });
    expect(container.textContent).not.toContain('May 3rd, 2024');
    const button = container.querySelector('button');
    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('May 3rd, 2024');
    expect(container.textContent).toContain('50');
    expect(container.textContent).toContain('Corporate');
    expect(container.textContent).toContain('Year end function');
  });
});
