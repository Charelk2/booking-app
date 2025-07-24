import { flushPromises } from "@/test/utils/flush";
import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import Header from '../Header';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('next/link', () => ({ __esModule: true, default: (props: Record<string, unknown>) => <a {...props} /> }));
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn(() => ({ user: null, logout: jest.fn() })) }));


function render() {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  return { div, root };
}

describe('Header', () => {
  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('renders search bar on home page', async () => {
    (usePathname as jest.Mock).mockReturnValue('/');
    const { div, root } = render();
    await act(async () => {
      root.render(<Header />);
    });
    await flushPromises();
    expect(div.firstChild).toMatchSnapshot();
    act(() => root.unmount());
    div.remove();
  });

  it('renders artists header when extraBar provided', async () => {
    (usePathname as jest.Mock).mockReturnValue('/artists');
    const { div, root } = render();
    await act(async () => {
      root.render(<Header extraBar={<div>bar</div>} />);
    });
    await flushPromises();
    expect(div.firstChild).toMatchSnapshot();
    act(() => root.unmount());
    div.remove();
  });
});
