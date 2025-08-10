import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { axe, toHaveNoViolations } from 'jest-axe';
import ServiceProvidersPage from '../app/service-providers/page';
import BookingWizard from '../components/booking/BookingWizard';
import { BookingProvider } from '../contexts/BookingContext';
import * as api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

jest.mock('../lib/api');
jest.mock('../contexts/AuthContext');
expect.extend(toHaveNoViolations);

describe('accessibility audits', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({ user: null });
    (api.getServiceProviders as jest.Mock).mockResolvedValue({ data: [], total: 0, price_distribution: [] });
    (api.getServiceProviderAvailability as jest.Mock).mockResolvedValue({ data: { unavailable_dates: [] } });
    (api.getServiceProvider as jest.Mock).mockResolvedValue({ data: { location: 'NYC' } });
  });

  it('Service providers page has no axe violations', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(<ServiceProvidersPage />);
    });
    const results = await axe(div, { rules: { 'landmark-unique': { enabled: false } } });
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
