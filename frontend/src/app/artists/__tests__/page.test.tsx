import { act } from 'react';
import { createRoot } from 'react-dom/client';
import React from 'react';
import ArtistsPage from '../page';
import * as api from '@/lib/api';
import type { ArtistProfile } from '@/types';

jest.mock('@/lib/api');

function setup() {
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

  it('calls getArtists with updated filters', async () => {
    const spy = jest.spyOn(api, 'getArtists').mockResolvedValue({ data: [] });
    const { container, root } = setup();
    await act(async () => {
      root.render(React.createElement(ArtistsPage));
      await Promise.resolve();
    });
    const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
    const catBtn = buttons.find((b) => b.textContent === 'Live Performance') as HTMLButtonElement;
    await act(async () => {
      catBtn.click();
      await Promise.resolve();
    });
    expect(spy).toHaveBeenLastCalledWith({ category: 'Live Performance', location: undefined, sort: undefined });
    act(() => root.unmount());
    container.remove();
  });

  it('displays fallback when user data is missing', async () => {
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
    await act(async () => {
      root.render(React.createElement(ArtistsPage));
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Unknown Artist');
    act(() => root.unmount());
    container.remove();
  });

  it('filters to verified artists only', async () => {
    jest.spyOn(api, 'getArtists').mockResolvedValue({
      data: [
        {
          id: 1,
          user: { first_name: 'A', last_name: 'B', is_verified: true },
          business_name: 'Alpha',
          user_id: 1,
        } as unknown as ArtistProfile,
        {
          id: 2,
          user: { first_name: 'C', last_name: 'D', is_verified: false },
          business_name: null,
          user_id: 2,
        } as unknown as ArtistProfile,
      ],
    });
    const { container, root } = setup();
    await act(async () => {
      root.render(React.createElement(ArtistsPage));
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Alpha');
    expect(container.textContent).toContain('C D');
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      checkbox.click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Alpha');
    expect(container.textContent).not.toContain('C D');
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
      await Promise.resolve();
    });
    expect(container.textContent).toContain('4.5');
    expect(container.querySelector('[aria-label="Verified"]')).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });
});
