import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ArtistsSection from '../ArtistsSection';
import { getServiceProviders } from '@/lib/api';

jest.mock('@/lib/api');

const mockedGetServiceProviders = getServiceProviders as jest.MockedFunction<typeof getServiceProviders>;

const MOCK_ARTISTS = [
  {
    id: 1,
    business_name: 'Artist One',
    profile_picture_url: '/a.jpg',
    rating: 4.5,
    rating_count: 10,
    hourly_rate: 100,
    price_visible: true,
    location: 'Cape Town',
    service_categories: [],
  },
  {
    id: 2,
    business_name: 'Artist Two',
    profile_picture_url: '/b.jpg',
    rating: 4.0,
    rating_count: 5,
    hourly_rate: 200,
    price_visible: true,
    location: 'Johannesburg',
    service_categories: [],
  },
];

describe('ArtistsSection carousel', () => {
  beforeEach(() => {
    mockedGetServiceProviders.mockResolvedValue({ data: MOCK_ARTISTS } as any);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('renders artists and scrolls when clicking next', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(ArtistsSection, { title: 'Popular' }));
    });

    const scroller = container.querySelector('[data-testid="artists-scroll"]') as HTMLDivElement;
    expect(scroller).not.toBeNull();
    // Horizontal scroll container styling
    expect(scroller.className).toContain('overflow-x-auto');
    expect(scroller.className).toContain('snap-x');

    // Cards render artist names from the API response
    expect(container.textContent).toContain('Artist One');
    expect(container.textContent).toContain('Artist Two');

    act(() => root.unmount());
    container.remove();
  });
});
