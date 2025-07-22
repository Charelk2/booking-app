import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ArtistsSection from '../ArtistsSection';
import * as api from '@/lib/api';
import type { ArtistProfile } from '@/types';

jest.mock('@/lib/api');

function setup() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

describe('ArtistsSection', () => {
  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('matches snapshot', async () => {
    (api.getArtists as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          business_name: 'A',
          user_id: 1,
          user: { first_name: 'A', last_name: 'B', is_verified: false },
        },
      ] as unknown as ArtistProfile[],
    });

    const { container, root } = setup();
    await act(async () => {
      root.render(<ArtistsSection title="Demo" />);
      await Promise.resolve();
    });

    expect(container.firstChild).toMatchSnapshot();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('hides section when empty and hideIfEmpty is true', async () => {
    (api.getArtists as jest.Mock).mockResolvedValue({ data: [] });

    const { container, root } = setup();
    await act(async () => {
      root.render(<ArtistsSection title="Demo" hideIfEmpty />);
      await Promise.resolve();
    });

    expect(container.firstChild).toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
