import { flushPromises } from "@/test/utils/flush";
import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import Header from '../Header';

jest.mock('next/link', () => ({ __esModule: true, default: (props: Record<string, unknown>) => <a {...props} /> }));
const mockUseSearchParams = jest.fn(() => new URLSearchParams());
const mockUsePathname = jest.fn(() => '/');
const mockUseRouter = jest.fn(() => ({ push: jest.fn() }));
jest.mock('next/navigation', () => ({
  ...jest.requireActual('next/navigation'),
  useRouter: () => mockUseRouter(),
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
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
      root.render(
        <Header headerState="initial" onForceHeaderState={jest.fn()} />,
      );
    });
    await flushPromises();
    expect(div.firstChild).toMatchSnapshot();
    act(() => root.unmount());
    div.remove();
  });

  it('hides search bar when disabled', async () => {
    const { div, root } = render();
    await act(async () => {
      root.render(
        <Header
          headerState="initial"
          onForceHeaderState={jest.fn()}
          showSearchBar={false}
        />,
      );
    });
    await flushPromises();
    expect(div.firstChild).toMatchSnapshot();
    act(() => root.unmount());
    div.remove();
  });

  it('renders extraBar when provided', async () => {
    const { div, root } = render();
    await act(async () => {
      root.render(
        <Header
          headerState="initial"
          onForceHeaderState={jest.fn()}
          showSearchBar={false}
          extraBar={<div>bar</div>}
        />,
      );
    });
    await flushPromises();
    expect(div.firstChild).toMatchSnapshot();
    act(() => root.unmount());
    div.remove();
  });

  it('initializes from query params', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams(
        'category=Live%20Performance&location=Cape%20Town&when=2025-12-31',
      ),
    );
    const { div, root } = render();
    await act(async () => {
      root.render(
        <Header headerState="compacted" onForceHeaderState={jest.fn()} />,
      );
    });
    await flushPromises();
    expect(div.textContent).toContain('Musician / Band');
    expect(div.textContent).toContain('Cape Town');
    expect(div.textContent).toContain('Dec');
    act(() => root.unmount());
    div.remove();
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
  });

  it('matches compact snapshot with filter control', async () => {
    const { div, root } = render();
    await act(async () => {
      root.render(
        <Header
          headerState="compacted"
          onForceHeaderState={jest.fn()}
          filterControl={<button>F</button>}
        />,
      );
    });
    await flushPromises();
    expect(div.firstChild).toMatchSnapshot();
    act(() => root.unmount());
    div.remove();
  });

  it('shows only street name in compact pill when location contains commas', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('location=123%20Main%20St%2C%20Cape%20Town%2C%20South%20Africa'),
    );
    const { div, root } = render();
    await act(async () => {
      root.render(
        <Header headerState="compacted" onForceHeaderState={jest.fn()} />,
      );
    });
    await flushPromises();
    const trigger = div.querySelector('#compact-search-trigger') as HTMLButtonElement;
    expect(trigger.textContent).toContain('123 Main St');
    expect(trigger.textContent).not.toContain('Cape Town');
    act(() => root.unmount());
    div.remove();
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
  });
});
