import { flushPromises } from "@/test/utils/flush";
import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import ProfilePicturePage from '../profile-picture/page';
import { uploadMyProfilePicture } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('@/lib/imageCrop', () => ({
  getCroppedImage: jest.fn(() =>
    Promise.resolve(new File(['c'], 'c.jpg', { type: 'image/jpeg' })),
  ),
  centerAspectCrop: jest.fn(() => ({
    unit: '%',
    width: 90,
    x: 0,
    y: 0,
    height: 90,
  })),
}));

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
    const btn = div.querySelector('[data-testid="crop-submit"]') as HTMLButtonElement;
    await act(async () => {
      btn.dispatchEvent(new Event('click', { bubbles: true }));
    });
    await flushPromises();
    expect(uploadMyProfilePicture).toHaveBeenCalled();
    expect(refreshUser).toHaveBeenCalled();
    act(() => { root.unmount(); });
    div.remove();
  });
});
