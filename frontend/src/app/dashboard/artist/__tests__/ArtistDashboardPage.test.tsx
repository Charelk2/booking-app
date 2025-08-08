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
  useSearchParams.mockReturnValue({ get: () => null });
  (useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: 'service_provider' }, loading: false });
  (api.getMyArtistBookings as jest.Mock).mockResolvedValue({ data: [] });
  (api.getArtistServices as jest.Mock).mockResolvedValue({ data: [] });
  (api.getArtistProfileMe as jest.Mock).mockResolvedValue({ data: {} });
  (api.getBookingRequestsForArtist as jest.Mock).mockResolvedValue({ data: [] });
  (api.getDashboardStats as jest.Mock).mockResolvedValue({ data: {} });

  render(<ArtistDashboardPage />);
  await waitFor(() => expect(api.getMyArtistBookings).toHaveBeenCalled());
  expect(api.getArtistServices).toHaveBeenCalled();
});

