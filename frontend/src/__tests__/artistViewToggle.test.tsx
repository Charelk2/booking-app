import React from 'react';
import { render, screen } from '@testing-library/react';
import Header from '../components/layout/Header';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('../components/layout/NotificationBell', () => {
  const MockNotificationBell: React.FC = () => <div />;
  MockNotificationBell.displayName = 'MockNotificationBell';
  return MockNotificationBell;
});
jest.mock('@/contexts/AuthContext');

const mockUseAuth = useAuth as jest.Mock;

describe('Header artist view', () => {
  it('shows artist links without search when artistViewActive', () => {
    const toggleArtistView = jest.fn();
    mockUseAuth.mockReturnValue({
      user: { id: 1, user_type: 'service_provider', email: 'a', first_name: 'A', last_name: 'B' },
      logout: jest.fn(),
      artistViewActive: true,
      toggleArtistView,
    });
    render(<Header headerState="compacted" onForceHeaderState={jest.fn()} />);
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Services')).toBeTruthy();
    expect(screen.getByText('Messages')).toBeTruthy();
    expect(screen.getAllByText('View Profile')).toHaveLength(1);
    expect(screen.queryByText('Add artist')).toBeNull();
    expect(screen.queryByText('Add location')).toBeNull();
    expect(document.querySelector('#compact-search-trigger')).toBeNull();
    expect(mockUseAuth).toHaveBeenCalled();
  });

  it('shows client nav when artistViewActive is false', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, user_type: 'service_provider', email: 'a', first_name: 'A', last_name: 'B' },
      logout: jest.fn(),
      artistViewActive: false,
      toggleArtistView: jest.fn(),
    });
    render(<Header headerState="initial" onForceHeaderState={jest.fn()} />);
    expect(screen.getByText('Service Providers')).toBeTruthy();
    expect(screen.queryByText('Today')).toBeNull();
    expect(mockUseAuth).toHaveBeenCalled();
  });
});
