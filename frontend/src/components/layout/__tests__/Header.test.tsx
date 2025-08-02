import { flushPromises } from "@/test/utils/flush";
import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import Header from '../Header';

jest.mock('next/link', () => ({ __esModule: true, default: (props: Record<string, unknown>) => <a {...props} /> }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: jest.fn(() => '/'),
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

  it('renders search bar when enabled', async () => {
    const { div, root } = render();
    await act(async () => {
      root.render(<Header />);
    });
    await flushPromises();
    expect(div.firstChild).toMatchSnapshot();
    act(() => root.unmount());
    div.remove();
  });

  it('hides search bar when disabled', async () => {
    const { div, root } = render();
    await act(async () => {
      root.render(<Header showSearchBar={false} />);
    });
    await flushPromises();
    expect(div.firstChild).toMatchSnapshot();
    act(() => root.unmount());
    div.remove();
  });

  it('renders extraBar when provided', async () => {
    const { div, root } = render();
    await act(async () => {
      root.render(<Header showSearchBar={false} extraBar={<div>bar</div>} />);
    });
    await flushPromises();
    expect(div.firstChild).toMatchSnapshot();
    act(() => root.unmount());
    div.remove();
  });
});
