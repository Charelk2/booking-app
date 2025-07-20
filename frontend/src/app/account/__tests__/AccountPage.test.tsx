import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import AccountPage from '../page';

jest.mock('@/components/layout/MainLayout', () => {
  const Mock = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Mock.displayName = 'MainLayout';
  return Mock;
});

describe('AccountPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders links to account actions', async () => {
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(<AccountPage />);
    });
    expect(div.textContent).toContain('Update Profile Picture');
    expect(div.textContent).toContain('Export Account Data');
    expect(div.textContent).toContain('Delete Account');
    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
