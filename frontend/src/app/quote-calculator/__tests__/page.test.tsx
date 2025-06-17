import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import QuoteCalculatorPage from '../page';
import * as api from '@/lib/api';

jest.mock('@/lib/api');
jest.mock('@/components/layout/MainLayout', () => {
  const Mock = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Mock.displayName = 'MockMainLayout';
  return Mock;
});

function setup() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

describe('QuoteCalculatorPage loaders', () => {
  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('shows a skeleton while providers load', async () => {
    let resolve: (value: { data: [] }) => void;
    (api.getSoundProviders as jest.Mock).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }),
    );
    const { container, root } = setup();
    await act(async () => {
      root.render(<QuoteCalculatorPage />);
    });
    const skeleton = container.querySelector('[data-testid="provider-skeleton"]');
    expect(skeleton).not.toBeNull();
    act(() => resolve({ data: [] }));
    await act(async () => {});
    expect(container.querySelector('[data-testid="provider-skeleton"]')).toBeNull();
    act(() => root.unmount());
    container.remove();
  });
});
