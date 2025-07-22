import { flushPromises } from "@/test/utils/flush";
import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import DeleteAccountPage from '../delete';
import { deleteMyAccount } from '@/lib/api';
import { useRouter } from 'next/navigation';

jest.mock('@/lib/api');
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));
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


describe('DeleteAccountPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('submits password and redirects', async () => {
    const push = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push });
    (deleteMyAccount as jest.Mock).mockResolvedValue({});
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(<DeleteAccountPage />);
    });
    const input = div.querySelector('input#password') as HTMLInputElement;
    if (!input) throw new Error('input not found');
    await act(async () => {
      input.value = 'pw';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const form = div.querySelector('form');
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flushPromises();
    expect(deleteMyAccount).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/login');
    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
