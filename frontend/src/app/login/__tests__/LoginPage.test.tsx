import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import LoginPage from '../page';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';

jest.mock('@/contexts/AuthContext');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
  usePathname: jest.fn(() => '/login'),
}));
jest.mock('@/components/layout/MainLayout', () => {
  const Mock = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Mock.displayName = 'MockMainLayout';
  return Mock;
});

describe('LoginPage redirect', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('redirects when already authenticated', async () => {
    const replace = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ replace });
    (useSearchParams as jest.Mock).mockReturnValue({ get: () => '/profile' });
    (useAuth as jest.Mock).mockReturnValue({
      login: jest.fn(),
      verifyMfa: jest.fn(),
      user: { id: 1, email: 'u@example.com', user_type: 'client' },
    });

    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(<LoginPage />);
    });
    expect(replace).toHaveBeenCalledWith('/profile');
    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
