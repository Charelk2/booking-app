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

jest.mock('@/contexts/AuthContext');
const mockUseAuth = useAuth as jest.Mock;

describe('Header profile menu', () => {
  it('shows edit profile link when user is logged in', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, user_type: 'service_provider', email: 'a', first_name: 'A' },
      logout: jest.fn(),
      artistViewActive: false,
      toggleArtistView: jest.fn(),
    });

    render(<Header headerState="initial" onForceHeaderState={jest.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(await screen.findByText('Edit Profile')).toBeTruthy();
  });

  it('shows client links including dashboard', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 2, user_type: 'client', email: 'b', first_name: 'B' },
      logout: jest.fn(),
      artistViewActive: false,
      toggleArtistView: jest.fn(),
    });

    render(<Header headerState="initial" onForceHeaderState={jest.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(await screen.findByText('Dashboard')).toBeTruthy();
    expect(await screen.findByText('Messages')).toBeTruthy();
  });
});
