import { render, waitFor } from '@testing-library/react';
import ArtistDashboardPage from '../page';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams, usePathname } from '@/tests/mocks/next-navigation';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');

test('loads artist data', async () => {
  useRouter.mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  usePathname.mockReturnValue('/dashboard/artist');
  useSearchParams.mockReturnValue(new URLSearchParams());
  (useAuth as jest.Mock).mockReturnValue({
    user: {
      id: 1,
      email: 'a@example.com',
      user_type: 'service_provider',
      first_name: 'A',
      last_name: 'B',
      phone_number: '',
      is_active: true,
      is_verified: true,
    },
    loading: false,
  });
  (api.getMyArtistBookingsCached as jest.Mock).mockResolvedValue([]);
  (api.getMyServices as jest.Mock).mockResolvedValue({ data: [] });
  (api.getServiceProviderProfileMe as jest.Mock).mockResolvedValue({ data: {} });
  (api.getBookingRequestsForArtistCached as jest.Mock).mockResolvedValue([]);
  (api.getDashboardStatsCached as jest.Mock).mockResolvedValue({
    monthly_new_inquiries: 0,
    profile_views: 0,
    response_rate: 0,
  });
  (api.getGoogleCalendarStatus as jest.Mock).mockResolvedValue({ data: { connected: false } });

  render(<ArtistDashboardPage />);
  await waitFor(() => expect(api.getMyArtistBookingsCached).toHaveBeenCalled());
  expect(api.getMyServices).toHaveBeenCalled();
});
