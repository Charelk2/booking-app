import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { axe, toHaveNoViolations } from 'jest-axe';
import ArtistsPage from '../app/artists/page';
import BookingWizard from '../components/booking/BookingWizard';
import { BookingProvider } from '../contexts/BookingContext';
import * as api from '../lib/api';

jest.mock('../lib/api');
expect.extend(toHaveNoViolations);

describe('accessibility audits', () => {
  beforeEach(() => {
    (api.getArtists as jest.Mock).mockResolvedValue({ data: [], total: 0, price_distribution: [] });
    (api.getArtistAvailability as jest.Mock).mockResolvedValue({ data: { unavailable_dates: [] } });
    (api.getArtist as jest.Mock).mockResolvedValue({ data: { location: 'NYC' } });
    (api.getRecommendedArtists as jest.Mock).mockResolvedValue([]);
  });

  it('Artists page has no axe violations', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(<ArtistsPage />);
    });
    const results = await axe(div);
    expect(results).toHaveNoViolations();
    act(() => root.unmount());
    div.remove();
  });

  it('Booking wizard has no axe violations', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <BookingProvider>
          <BookingWizard artistId={1} isOpen onClose={() => {}} />
        </BookingProvider>
      );
    });
    const results = await axe(div);
    expect(results).toHaveNoViolations();
    act(() => root.unmount());
    div.remove();
  });
});
