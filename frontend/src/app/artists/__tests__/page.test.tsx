import { flushPromises } from "@/test/utils/flush";
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import React from 'react';
import ArtistsPage from '../page';
import * as api from '@/lib/api';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { ArtistProfile } from '@/types';

jest.mock('@/lib/api');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
  usePathname: jest.fn(() => '/artists'),
}));


function setup(search: Record<string, string> = {}) {
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
  (useSearchParams as jest.Mock).mockReturnValue({
    get: (key: string) => search[key] || null,
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

describe('Artists page filters', () => {
  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });


  it('filters out entries with missing user data', async () => {
    jest.spyOn(api, 'getArtists').mockResolvedValue({
      data: [
        {
          id: 2,
          user: null,
          business_name: null,
          user_id: 2,
        } as unknown as ArtistProfile,
      ],
    });
    const { container, root } = setup();
    const push = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push });
    await act(async () => {
      root.render(React.createElement(ArtistsPage));
      await flushPromises();
    });
    expect(container.textContent).not.toContain('Unknown Artist');
    expect(container.textContent).toContain('No artists found');
    act(() => root.unmount());
    container.remove();
  });


  it('renders rating and verified badge', async () => {
    jest.spyOn(api, 'getArtists').mockResolvedValue({
      data: [
        {
          id: 3,
          business_name: 'Bravo',
          rating: 4.5,
          rating_count: 8,
          user: { first_name: 'E', last_name: 'F', is_verified: true },
          user_id: 3,
        } as unknown as ArtistProfile,
      ],
    });
    const { container, root } = setup();
    await act(async () => {
      root.render(React.createElement(ArtistsPage));
      await flushPromises();
    });
    expect(container.textContent).toContain('4.5');
    expect(container.querySelector('[aria-label="Verified"]')).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it('shows service price when category filter is used', async () => {
    jest.spyOn(api, 'getArtists').mockResolvedValue({
      data: [
        {
          id: 4,
          business_name: 'Pricey',
          service_price: 250,
          hourly_rate: 100,
          price_visible: true,
          user: { first_name: 'G', last_name: 'H', is_verified: false },
          user_id: 4,
        } as unknown as ArtistProfile,
      ],
    });
    const { container, root } = setup({ category: 'Live Performance' });
    await act(async () => {
      root.render(React.createElement(ArtistsPage));
      await flushPromises();
    });
    expect(container.textContent).toContain('from R250');
    act(() => root.unmount());
    container.remove();
  });

  it('shows message when no artists found', async () => {
    jest.spyOn(api, 'getArtists').mockResolvedValue({ data: [] });
    const { container, root } = setup();
    await act(async () => {
      root.render(React.createElement(ArtistsPage));
      await flushPromises();
    });
    expect(container.textContent).toContain('No artists found');
    act(() => root.unmount());
    container.remove();
  });

  it('loads more artists when Load More clicked', async () => {
    const firstPage = {
      data: Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        business_name: `Name${i + 1}`,
        user: { first_name: 'A', last_name: 'B', is_verified: false },
        user_id: i + 1,
      })) as unknown as ArtistProfile[],
    };
    const secondPage = {
      data: [
        {
          id: 21,
          business_name: 'Name21',
          user: { first_name: 'C', last_name: 'D', is_verified: false },
          user_id: 21,
        },
      ] as unknown as ArtistProfile[],
    };
    const spy = jest
      .spyOn(api, 'getArtists')
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);
    const { container, root } = setup();
    await act(async () => {
      root.render(React.createElement(ArtistsPage));
      await flushPromises();
    });
    const loadBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Load More',
    ) as HTMLButtonElement;
    expect(loadBtn).not.toBeNull();
    await act(async () => {
      loadBtn.click();
      await flushPromises();
    });
    expect(spy).toHaveBeenLastCalledWith({
      category: undefined,
      location: undefined,
      sort: undefined,
      minPrice: 0,
      maxPrice: 200000,
      page: 2,
      limit: 20,
    });
    act(() => root.unmount());
    container.remove();
  });

  it('clears all filters', async () => {
    const spy = jest.spyOn(api, 'getArtists').mockResolvedValue({ data: [] });
    const { container, root } = setup();
    await act(async () => {
      root.render(React.createElement(ArtistsPage));
      await flushPromises();
    });
    const locationInput = container.querySelector('input[data-testid="location-input"]') as HTMLInputElement;
    const sortSelect = container.querySelector('select') as HTMLSelectElement;
    await act(async () => {
      locationInput.value = 'NY';
      locationInput.dispatchEvent(new Event('input', { bubbles: true }));
      sortSelect.value = 'newest';
      sortSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await flushPromises();
    });
    const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Clear filters') as HTMLButtonElement;
    expect(button).not.toBeNull();
    await act(async () => {
      button.click();
      await flushPromises();
    });
    expect(spy).toHaveBeenLastCalledWith({
      category: undefined,
      location: undefined,
      sort: undefined,
      minPrice: 0,
      maxPrice: 200000,
      page: 1,
      limit: 20,
    });
    expect(push).toHaveBeenLastCalledWith('/artists');
    act(() => root.unmount());
    container.remove();
  });

  it('restores filters from the URL on load', async () => {
    jest.spyOn(api, 'getArtists').mockResolvedValue({ data: [] });
    const { container, root } = setup({
      category: 'Live Performance',
      location: 'Paris',
      sort: 'newest',
      minPrice: '10',
      maxPrice: '500',
    });
    await act(async () => {
      root.render(React.createElement(ArtistsPage));
      await flushPromises();
    });
    const locationInput = container.querySelector('input[data-testid="location-input"]') as HTMLInputElement;
    expect(locationInput.value).toBe('Paris');
    const selected = Array.from(container.querySelectorAll('button[aria-pressed]')).find(
      (b) => b.getAttribute('aria-pressed') === 'true' && b.textContent === 'Live Performance',
    );
    expect(selected).toBeTruthy();
    const sortSelect = container.querySelector('select') as HTMLSelectElement;
    expect(sortSelect.value).toBe('newest');
    const applyBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Apply',
    );
    expect(applyBtn).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });

});
