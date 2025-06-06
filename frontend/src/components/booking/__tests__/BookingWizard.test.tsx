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
    (api.getArtistAvailability as jest.Mock).mockResolvedValue({ data: { unavailable_dates: [] } });
    (api.getArtist as jest.Mock).mockResolvedValue({ data: { location: 'NYC' } });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    // jsdom does not implement scrollTo, so provide a stub
    // @ts-ignore
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
});
