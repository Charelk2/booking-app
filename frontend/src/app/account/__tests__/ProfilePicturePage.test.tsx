import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import ProfilePicturePage from '../profile-picture';
import { uploadMyProfilePicture } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');
jest.mock('@/components/layout/MainLayout', () => {
  const Mock = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Mock.displayName = 'MainLayout';
  return Mock;
});
jest.mock('@/components/ui/Button', () => {
  const Btn = (props: Record<string, unknown>) => <button {...props} />;
  Btn.displayName = 'Button';
  return Btn;
});

describe('ProfilePicturePage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('uploads file and refreshes user', async () => {
    const refreshUser = jest.fn();
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: 'client' }, refreshUser });
    (uploadMyProfilePicture as jest.Mock).mockResolvedValue({ data: {} });
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(<ProfilePicturePage />);
    });
    const input = div.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['1'], 'a.jpg', { type: 'image/jpeg' });
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const form = div.querySelector('form');
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await act(async () => { await Promise.resolve(); });
    expect(uploadMyProfilePicture).toHaveBeenCalled();
    expect(refreshUser).toHaveBeenCalled();
    act(() => { root.unmount(); });
    div.remove();
  });
});
