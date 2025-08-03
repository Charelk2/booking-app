import { render, waitFor } from '@testing-library/react';
import ClientDashboardPage from '../page';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(() => '/dashboard/client'),
  useSearchParams: jest.fn(),
}));

test('loads client data', async () => {
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (useSearchParams as jest.Mock).mockReturnValue({ get: () => null });
  (useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: 'client' }, loading: false });
  (api.getMyClientBookings as jest.Mock).mockResolvedValue({ data: [] });
  (api.getMyBookingRequests as jest.Mock).mockResolvedValue({ data: [] });

  render(<ClientDashboardPage />);
  await waitFor(() => expect(api.getMyClientBookings).toHaveBeenCalled());
  expect(api.getMyBookingRequests).toHaveBeenCalled();
});

