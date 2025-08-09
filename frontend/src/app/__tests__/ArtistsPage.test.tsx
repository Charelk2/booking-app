import { render, screen, waitFor } from '@testing-library/react';
import ArtistsPage from '../artists/page';
import { getArtists, getRecommendedArtists } from '@/lib/api';
import { useSearchParams } from '@/tests/mocks/next-navigation';
import { useAuth } from '@/contexts/AuthContext';
import type { ArtistProfile } from '@/types';

jest.mock('next/navigation', () => require('@/tests/mocks/next-navigation'));
jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');

const mockedGetArtists = getArtists as jest.MockedFunction<typeof getArtists>;
const mockedGetRecommended = getRecommendedArtists as jest.MockedFunction<typeof getRecommendedArtists>;
const mockedUseAuth = useAuth as jest.Mock;

describe('ArtistsPage', () => {
  beforeEach(() => {
    useSearchParams.mockReturnValue(new URLSearchParams('category=DJ'));
    mockedUseAuth.mockReturnValue({ user: { id: 1 } });
    mockedGetArtists.mockResolvedValue({ data: [], total: 0, price_distribution: [] });
      mockedGetRecommended.mockResolvedValue([
        {
          id: 1,
          user: { first_name: 'Rec', last_name: 'DJ' },
          service_category: { name: 'DJ' },
        },
        {
          id: 2,
          user: { first_name: 'Rec', last_name: 'Musician' },
          service_category: { name: 'Musician' },
        },
      ] as unknown as ArtistProfile[]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('requests and filters DJs', async () => {
    render(<ArtistsPage />);
    await waitFor(() => expect(mockedGetArtists).toHaveBeenCalled());
    expect(mockedGetArtists).toHaveBeenCalledWith(expect.objectContaining({ category: 'DJ' }));

    await screen.findByText('Rec DJ');
    expect(screen.queryByText('Rec Musician')).not.toBeInTheDocument();
  });

  it('normalizes UI slug category query param', async () => {
    useSearchParams.mockReturnValue(new URLSearchParams('category=dj'));
    render(<ArtistsPage />);
    await waitFor(() => expect(mockedGetArtists).toHaveBeenCalled());
    expect(mockedGetArtists).toHaveBeenCalledWith(expect.objectContaining({ category: 'DJ' }));
  });
});
