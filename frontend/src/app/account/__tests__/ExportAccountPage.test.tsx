import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import ExportAccountPage from '../export';
import { exportMyAccount } from '@/lib/api';

jest.mock('@/lib/api');
jest.mock('@/components/layout/MainLayout', () => {
  const Mock = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Mock.displayName = 'MainLayout';
  return Mock;
});

const flushPromises = async () => {
  await act(async () => {});
};

describe('ExportAccountPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('fetches data and displays JSON', async () => {
    (exportMyAccount as jest.Mock).mockResolvedValue({ data: { user: { id: 1 } } });
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(<ExportAccountPage />);
    });
    await flushPromises();
    expect(exportMyAccount).toHaveBeenCalled();
    expect(div.textContent).toContain('"id": 1');
    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
