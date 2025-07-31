import React from 'react';
import { render, screen } from '@testing-library/react';
import Header from '../components/layout/Header';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('../components/layout/NotificationBell', () => () => <div />);
jest.mock('../components/layout/BookingRequestIcon', () => () => <div />);

jest.mock('@/contexts/AuthContext');

const mockUseAuth = useAuth as jest.Mock;

describe('Header artist view', () => {
  it('shows artist links when artistViewActive', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, user_type: 'artist', email: 'a', first_name: 'A', last_name: 'B' },
      logout: jest.fn(),
      artistViewActive: true,
      toggleArtistView: jest.fn(),
    });
    render(<Header />);
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('View Profile')).toBeInTheDocument();
    expect(screen.getByText('Services')).toBeInTheDocument();
    expect(screen.getByText('Messages')).toBeInTheDocument();
  });

  it('shows client nav when artistViewActive is false', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, user_type: 'artist', email: 'a', first_name: 'A', last_name: 'B' },
      logout: jest.fn(),
      artistViewActive: false,
      toggleArtistView: jest.fn(),
    });
    render(<Header />);
    expect(screen.getByText('Artists')).toBeInTheDocument();
    expect(screen.queryByText('Today')).toBeNull();
  });
});
