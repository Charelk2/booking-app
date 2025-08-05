import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Header from '../Header';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('../NotificationBell', () => {
  const MockNotificationBell: React.FC = () => <div />;
  MockNotificationBell.displayName = 'MockNotificationBell';
  return MockNotificationBell;
});

jest.mock('../BookingRequestIcon', () => {
  const MockBookingRequestIcon: React.FC = () => <div />;
  MockBookingRequestIcon.displayName = 'MockBookingRequestIcon';
  return MockBookingRequestIcon;
});

jest.mock('@/contexts/AuthContext');
const mockUseAuth = useAuth as jest.Mock;

describe('Header profile menu', () => {
  it('shows edit profile link when user is logged in', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, user_type: 'artist', email: 'a', first_name: 'A' },
      logout: jest.fn(),
      artistViewActive: false,
      toggleArtistView: jest.fn(),
    });

    render(<Header headerState="initial" onForceHeaderState={jest.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(await screen.findByText('Edit Profile')).toBeTruthy();
  });
});
