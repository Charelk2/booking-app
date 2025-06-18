import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import ContactPage from '../page';

jest.mock('@/components/layout/MainLayout', () => ({ children }: { children: React.ReactNode }) => <div>{children}</div>);

describe('ContactPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders contact heading', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(<ContactPage />);
    });
    expect(div.textContent).toContain('Contact Support');
    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
