import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import AccountPage from '../page';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('@/components/layout/MainLayout', () => {
  const Mock = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Mock.displayName = 'MainLayout';
  return Mock;
});

jest.mock('@/components/auth/PhoneNumberField', () => {
  const React = require('react');
  const Mock = ({ label }: { label?: string }) => <div>{label || 'Phone number'}</div>;
  Mock.displayName = 'PhoneNumberField';
  return { __esModule: true, default: Mock };
});

describe('AccountPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders core account settings sections', async () => {
    (useAuth as unknown as jest.Mock).mockReturnValue({
      user: {
        id: 1,
        email: 'test@example.com',
        user_type: 'client',
        first_name: 'Test',
        last_name: 'User',
        phone_number: '+27821234567',
        is_active: true,
        is_verified: true,
        marketing_opt_in: false,
      },
      token: null,
      loading: false,
      logout: jest.fn(),
      refreshUser: jest.fn(),
      artistViewActive: true,
      toggleArtistView: jest.fn(),
    });

    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(<AccountPage />);
    });
    expect(div.textContent).toContain('Account');
    expect(div.textContent).toContain('Current email');
    expect(div.textContent).toContain('test@example.com');
    expect(div.textContent).toContain('Export your data');
    expect(div.textContent).toContain('Delete account');
    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
