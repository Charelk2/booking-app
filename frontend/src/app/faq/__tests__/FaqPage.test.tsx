/* eslint-disable react/display-name */
import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import FaqPage from '../page';

// simplify MainLayout for unit test
jest.mock('@/components/layout/MainLayout', () => ({ children }: { children: React.ReactNode }) => <div>{children}</div>);

describe('FaqPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders FAQ heading', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(<FaqPage />);
    });
    expect(div.textContent).toContain('Frequently Asked Questions');
    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
