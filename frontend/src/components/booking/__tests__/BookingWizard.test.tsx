import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import BookingWizard from '../BookingWizard';
import { BookingProvider, useBooking } from '@/contexts/BookingContext';
import * as api from '@/lib/api';

jest.mock('@/lib/api');

function Wrapper() {
  return (
    <BookingProvider>
      <ExposeSetter />
      <BookingWizard artistId={1} />
    </BookingProvider>
  );
}

  function ExposeSetter() {
    const { setStep } = useBooking();
    // Cast to unknown first to avoid eslint no-explicit-any complaint
    (window as unknown as { __setStep: (step: number) => void }).__setStep = setStep;
    return null;
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
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.clearAllMocks();
  });

  it('scrolls to top when advancing steps', async () => {
    const nextButton = container.querySelector('[data-testid="mobile-next-button"]') as HTMLButtonElement;
    await act(async () => {
      nextButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(window.scrollTo).toHaveBeenCalled();
  });

  it('does not render inline next button on mobile', () => {
    const inline = container.querySelector('[data-testid="date-next-button"]');
    expect(inline).toBeNull();
  });

  it('shows step heading and updates on next', async () => {
    const heading = () =>
      container.querySelector('[data-testid="step-heading"]')?.textContent;
    expect(heading()).toContain('Date & Time');
    const next = container.querySelector('[data-testid="mobile-next-button"]') as HTMLButtonElement;
    await act(async () => {
      next.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(heading()).toContain('Location');
  });

  it('advances to the location step without inline button', async () => {
    const next = container.querySelector('[data-testid="mobile-next-button"]') as HTMLButtonElement;
    await act(async () => {
      next.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(
      container.querySelector('[data-testid="location-next-button"]'),
    ).toBeNull();
  });

  it('no inline action buttons exist for any step', async () => {
    const setStep = (window as unknown as { __setStep: (s: number) => void }).__setStep;
    const expectNoButton = (testId: string) => {
      expect(container.querySelector(`[data-testid="${testId}"]`)).toBeNull();
    };

    await act(async () => { setStep(1); });
    expectNoButton('location-next-button');
    await act(async () => { setStep(2); });
    expectNoButton('guests-next-button');
    await act(async () => { setStep(3); });
    expectNoButton('venue-next-button');
    await act(async () => { setStep(4); });
    expectNoButton('notes-next-button');
    await act(async () => { setStep(5); });
    expectNoButton('review-submit-button');
  });

  it('wraps the summary sidebar in a details element on mobile', () => {
    const details = container.querySelector('details');
    const summary = container.querySelector('details summary');
    expect(details).not.toBeNull();
    expect(summary?.textContent).toContain('Booking Summary');
  });
});
