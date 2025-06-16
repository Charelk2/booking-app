import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import LoginPage from '../page';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

jest.mock('@/contexts/AuthContext');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(() => '/login'),
}));

describe('LoginPage remember me option', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders a remember me checkbox with label', async () => {
    (useAuth as jest.Mock).mockReturnValue({ login: jest.fn() });
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<LoginPage />);
    });
    const checkbox = container.querySelector('#remember') as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    expect(checkbox.getAttribute('aria-label')).toBe('Remember me');
    const label = container.querySelector('label[for="remember"]');
    expect(label?.textContent).toContain('Remember me');
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
