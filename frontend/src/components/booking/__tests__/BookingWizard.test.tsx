import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import BookingWizard from '../BookingWizard';
import { BookingProvider } from '@/contexts/BookingContext';
import * as api from '@/lib/api';

jest.mock('@/lib/api');

function Wrapper() {
  return (
    <BookingProvider>
      <BookingWizard artistId={1} />
    </BookingProvider>
  );
}

describe('BookingWizard mobile scrolling', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    Object.defineProperty(window, 'innerWidth', { value: 500, writable: true });
    (api.getArtistAvailability as jest.Mock).mockResolvedValue({ data: { unavailable_dates: [] } });
    (api.getArtist as jest.Mock).mockResolvedValue({ data: { location: 'NYC' } });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    // jsdom does not implement scrollTo, so provide a stub
    // @ts-expect-error - jsdom does not implement scrollTo
    window.scrollTo = jest.fn();

    await act(async () => {
      root.render(React.createElement(Wrapper));
    });
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    jest.clearAllMocks();
  });

  it('scrolls to top when advancing steps', async () => {
    const nextButton = container.querySelector('button') as HTMLButtonElement;
    await act(async () => {
      nextButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(window.scrollTo).toHaveBeenCalled();
  });

  it('renders inline next button on mobile', () => {
    const inline = container.querySelector('[data-testid="date-next-button"]');
    expect(inline).not.toBeNull();
  });

  it('shows step heading and updates on next', async () => {
    const heading = () =>
      container.querySelector('[data-testid="step-heading"]')?.textContent;
    expect(heading()).toContain('Date & Time');
    const next = container.querySelector('[data-testid="date-next-button"]') as HTMLButtonElement;
    await act(async () => {
      next.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(heading()).toContain('Location');
  });

  it('shows confirm location button after advancing', async () => {
    const inline = container.querySelector('[data-testid="date-next-button"]') as HTMLButtonElement;
    await act(async () => {
      inline.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const confirm = container.querySelector('[data-testid="location-next-button"]');
    expect(confirm).not.toBeNull();
  });

  it('shows inline buttons for all remaining steps', async () => {
    const click = async (testId: string) => {
      const btn = container.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement;
      await act(async () => {
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    };

    await click('date-next-button');
    await click('location-next-button');
    expect(container.querySelector('[data-testid="guests-next-button"]')).not.toBeNull();
    await click('guests-next-button');
    expect(container.querySelector('[data-testid="venue-next-button"]')).not.toBeNull();
    await click('venue-next-button');
    expect(container.querySelector('[data-testid="notes-next-button"]')).not.toBeNull();
    await click('notes-next-button');
    expect(container.querySelector('[data-testid="review-submit-button"]')).not.toBeNull();
  });
});
