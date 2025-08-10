import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ArtistsSection from '../ArtistsSection';
import { getServiceProviders } from '@/lib/api';

jest.mock('@/lib/api');

const mockedGetServiceProviders = getServiceProviders as jest.MockedFunction<typeof getServiceProviders>;

function makeArtists(count: number) {
  return Array.from({ length: count }).map((_, i) => ({
    id: i + 1,
    business_name: `Artist ${i + 1}`,
    custom_subtitle: null,
    profile_picture_url: null,
    portfolio_urls: [],
    hourly_rate: null,
    price_visible: false,
    rating: null,
    rating_count: null,
    location: 'Cape Town',
    service_categories: [],
    user: { first_name: 'A', last_name: 'B' },
  }));
}

describe('ArtistsSection carousel', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('renders carousel when more than seven artists', async () => {
    mockedGetServiceProviders.mockResolvedValue({ data: makeArtists(8) } as any);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(ArtistsSection, { title: 'Test' }));
    });
    const next = container.querySelector('button[aria-label="Next"]');
    expect(next).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it('renders grid without carousel when seven or fewer artists', async () => {
    mockedGetServiceProviders.mockResolvedValue({ data: makeArtists(5) } as any);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(ArtistsSection, { title: 'Test' }));
    });
    const next = container.querySelector('button[aria-label="Next"]');
    expect(next).toBeNull();
    act(() => root.unmount());
    container.remove();
  });
});
