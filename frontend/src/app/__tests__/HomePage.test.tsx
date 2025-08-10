import { createRoot } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import HomePage from '../page';

jest.mock('@/components/layout/MainLayout', () => {
  const Mock = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Mock.displayName = 'MockMainLayout';
  return Mock;
});

describe('HomePage', () => {
  it('renders artist sections', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(<HomePage />);
    });
    expect(div.textContent).toContain('Popular Musicians');
    expect(div.textContent).toContain('Top Rated');
    expect(div.textContent).toContain('New on Booka');
    act(() => {
      root.unmount();
    });
    div.remove();
  });

  it('renders category-specific providers when category is selected', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(<HomePage searchParams={{ category: 'dj' }} />);
    });
    expect(div.textContent).toContain('DJs');
    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
