import { createRoot } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import HomePage from '../page';

jest.mock('@/components/layout/MainLayout', () => {
  const Mock = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Mock.displayName = 'MockMainLayout';
  return Mock;
});
jest.mock('@/components/layout/Hero', () => {
  const Mock = () => <div data-testid="hero" />;
  Mock.displayName = 'MockHero';
  return Mock;
});

describe('HomePage', () => {
  it('renders hero section', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(<HomePage />);
    });
    expect(div.querySelector('[data-testid="hero"]')).toBeTruthy();
    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
