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

describe('BookingWizard flow', () => {
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

  function getButton(label: string): HTMLButtonElement {
    return Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes(label),
    ) as HTMLButtonElement;
  }

  it('scrolls to top when advancing steps', async () => {
    const nextButton = getButton('Next');
    await act(async () => {
      nextButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(window.scrollTo).toHaveBeenCalled();
  });

  it('shows step heading and updates on next', async () => {
    const heading = () =>
      container.querySelector('[data-testid="step-heading"]')?.textContent;
    expect(heading()).toContain('Date & Time');
    const next = getButton('Next');
    await act(async () => {
      next.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(heading()).toContain('Location');
  });

  it('collapses inactive steps on mobile', async () => {
    const details = () => Array.from(container.querySelectorAll('details'));
    expect(details()[0].open).toBe(true);
    expect(details()[1].open).toBe(false);
    const next = getButton('Next');
    await act(async () => {
      next.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 0));
    const updated = details();
    expect(updated[0].open).toBe(false);
    expect(updated[1].open).toBe(true);
  });

  it('shows summary only on the review step', async () => {
    expect(container.querySelector('h2')?.textContent).toContain('Date & Time');
    expect(container.textContent).not.toContain('Summary');
    const setStep = (window as unknown as { __setStep: (s: number) => void }).__setStep;
    await act(async () => { setStep(6); });
    await new Promise((r) => setTimeout(r, 400));
    expect(container.querySelector('h2')?.textContent).toContain('Review');
    expect(container.textContent).toContain('Summary');
  });

  it('allows navigating back via the progress bar', async () => {
    const next = getButton('Next');
    await act(async () => {
      next.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 0));
    const progressButtons = container.querySelectorAll('[aria-label="Progress"] button');
    expect(progressButtons.length).toBeGreaterThan(1);
    await act(async () => {
      progressButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 400));
    expect(
      container.querySelector('[data-testid="step-heading"]')?.textContent,
    ).toContain('Date & Time');
  });

  it('keeps future completed steps clickable when rewinding', async () => {
    const setStep = (window as unknown as { __setStep: (s: number) => void }).__setStep;
    await act(async () => { setStep(2); });
    await new Promise((r) => setTimeout(r, 0));
    let progressButtons = container.querySelectorAll('[aria-label="Progress"] button');
    await act(async () => {
      progressButtons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 400));
    // query again after DOM update
    progressButtons = container.querySelectorAll('[aria-label="Progress"] button');
    expect((progressButtons[2] as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows a loader while fetching availability', async () => {
    let resolve: (value: { data: { unavailable_dates: string[] } }) => void;
    (api.getArtistAvailability as jest.Mock).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }),
    );
    act(() => {
      root.unmount();
    });
    container.innerHTML = '';
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(Wrapper));
    });
    const skeleton = container.querySelector('[data-testid="calendar-skeleton"]');
    expect(skeleton).not.toBeNull();
    act(() => resolve({ data: { unavailable_dates: [] } }));
    await act(async () => {});
    expect(container.querySelector('[data-testid="calendar-skeleton"]')).toBeNull();
  });

  it('renders a sticky progress indicator', () => {
    const wrapper = container.querySelector('[aria-label="Progress"]')?.parentElement;
    expect(wrapper?.className).toContain('sticky');
  });
});
