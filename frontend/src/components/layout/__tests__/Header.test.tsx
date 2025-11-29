import { flushPromises } from "@/test/utils/flush";
import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import Header from '../Header';
import { useSearchParams, usePathname } from '@/tests/mocks/next-navigation';
import useServiceCategories from '@/hooks/useServiceCategories';

jest.mock('next/link', () => ({ __esModule: true, default: (props: Record<string, unknown>) => <a {...props} /> }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn(() => ({ user: null, logout: jest.fn() })) }));
jest.mock('@/hooks/useServiceCategories');

const mockedUseServiceCategories = useServiceCategories as jest.Mock;


function render() {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  return { div, root };
}

describe('Header', () => {
  beforeEach(() => {
    mockedUseServiceCategories.mockReturnValue([
      { id: 1, value: 'musician', label: 'Musician / Band' },
      { id: 2, value: 'dj', label: 'DJ' },
    ]);
    usePathname.mockReturnValue('/');
    useSearchParams.mockReturnValue(new URLSearchParams());
  });
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
    // Full search form visible on desktop
    const searchForm = div.querySelector('form[role="search"][aria-label="Service Provider booking search"]');
    expect(searchForm).toBeTruthy();
    // Compact pill exists in the DOM for desktop state transitions
    expect(div.querySelector('#compact-search-trigger')).toBeTruthy();
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
    // No search bar or compact pill when disabled
    expect(div.querySelector('form[role="search"]')).toBeNull();
    expect(div.querySelector('#compact-search-trigger')).toBeNull();
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
    expect(div.textContent).toContain('bar');
    act(() => root.unmount());
    div.remove();
  });

  it('initializes from query params', async () => {
    useSearchParams.mockReturnValue(
      new URLSearchParams(
        'category=musician&location=Cape%20Town&when=2025-12-31',
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
    useSearchParams.mockReturnValue(new URLSearchParams());
  });

  it('derives category from /category path', async () => {
    useSearchParams.mockReturnValue(new URLSearchParams());
    usePathname.mockReturnValue('/category/dj');
    mockedUseServiceCategories.mockReturnValue([
      { id: 1, value: 'dj', label: 'DJ' },
    ]);
    const { div, root } = render();
    await act(async () => {
      root.render(
        <Header headerState="initial" onForceHeaderState={jest.fn()} />,
      );
    });
    await flushPromises();
    expect(div.textContent).toContain('DJ');
    act(() => root.unmount());
    div.remove();
    usePathname.mockReturnValue('/');
  });

  it('matches compact snapshot with filter control', async () => {
    const { div, root } = render();
    await act(async () => {
      root.render(
        <Header
          headerState="compacted"
          onForceHeaderState={jest.fn()}
          filterControl={<button aria-label="Filters">F</button>}
        />,
      );
    });
    await flushPromises();
    const trigger = div.querySelector('#compact-search-trigger') as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    expect(trigger.textContent).toContain('Add service');
    expect(div.querySelector('[aria-label="Filters"]')).toBeTruthy();
    act(() => root.unmount());
    div.remove();
  });

  it('shows only street name in compact pill when location contains commas', async () => {
    useSearchParams.mockReturnValue(
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
    useSearchParams.mockReturnValue(new URLSearchParams());
  });

  it('sets CSS variable with header height on the document root', async () => {
    // CSS header height var is now owned by MainLayout (`--app-header-height`).
    // This test is kept only to assert that rendering Header does not throw.
    const { div, root } = render();
    await act(async () => {
      root.render(
        <Header headerState="initial" onForceHeaderState={jest.fn()} />,
      );
    });
    await flushPromises();
    expect(div.querySelector('#app-header')).toBeTruthy();
    act(() => root.unmount());
    div.remove();
  });
});
