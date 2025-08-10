import { render, screen, waitFor } from '@testing-library/react';
import ArtistsPage from '../artists/page';
import { getArtists } from '@/lib/api';
import { useSearchParams, usePathname } from '@/tests/mocks/next-navigation';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('next/navigation', () => require('@/tests/mocks/next-navigation'));
jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');

const mockedGetArtists = getArtists as jest.MockedFunction<typeof getArtists>;
const mockedUseAuth = useAuth as jest.Mock;

describe('ArtistsPage', () => {
  beforeEach(() => {
    useSearchParams.mockReturnValue(new URLSearchParams('category=DJ'));
    usePathname.mockReturnValue('/');
    mockedUseAuth.mockReturnValue({ user: { id: 1, first_name: 'Test', email: 't@example.com' } });
    mockedGetArtists.mockResolvedValue({
      data: [
        {
          id: 10,
          user: { first_name: 'DJ', last_name: 'One' },
          business_name: 'DJ One Biz',
        },
        {
          id: 11,
          user: { first_name: 'DJ', last_name: 'NoBiz' },
        },
      ],
      total: 2,
      price_distribution: [],
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('requests and filters DJs', async () => {
    render(<ArtistsPage />);
    await waitFor(() => expect(mockedGetArtists).toHaveBeenCalledTimes(1));
    expect(mockedGetArtists).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'DJ' }),
    );

    await screen.findByText('DJ One Biz');
    expect(screen.queryByText('DJ NoBiz')).toBeNull();
  });

  it('normalizes UI slug category query param', async () => {
    useSearchParams.mockReturnValue(new URLSearchParams('category=dj'));
    render(<ArtistsPage />);
    await waitFor(() => expect(mockedGetArtists).toHaveBeenCalledTimes(1));
    expect(mockedGetArtists).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'DJ' }),
    );
  });

  it('derives category from /category path', async () => {
    useSearchParams.mockReturnValue(new URLSearchParams());
    usePathname.mockReturnValue('/category/dj');
    render(<ArtistsPage />);
    await waitFor(() => expect(mockedGetArtists).toHaveBeenCalledTimes(1));
    expect(mockedGetArtists).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'DJ' }),
    );
  });
});
