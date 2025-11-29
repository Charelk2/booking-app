import { render, waitFor } from '@testing-library/react';
import ClientDashboardPage from '../page';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams, usePathname } from '@/tests/mocks/next-navigation';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');

test('loads client data', async () => {
  useRouter.mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  usePathname.mockReturnValue('/dashboard/client');
  useSearchParams.mockReturnValue({ get: () => null });
  (useAuth as jest.Mock).mockReturnValue({
    user: { id: 1, user_type: 'client', email: 'client@test.com' },
    loading: false,
  });
  (api.peekClientDashboardCache as jest.Mock).mockReturnValue({
    bookings: null,
    requests: null,
  });
  (api.getMyClientBookingsCached as jest.Mock).mockResolvedValue([]);
  (api.getMyBookingRequestsCached as jest.Mock).mockResolvedValue([]);

  render(<ClientDashboardPage />);
  await waitFor(() => expect(api.getMyClientBookingsCached).toHaveBeenCalled());
  expect(api.getMyBookingRequestsCached).toHaveBeenCalled();
});
