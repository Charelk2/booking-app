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
});
