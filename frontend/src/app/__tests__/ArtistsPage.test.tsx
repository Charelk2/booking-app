import { render, screen, waitFor } from '@testing-library/react';
import ArtistsPage from '../artists/page';
import { getArtists } from '@/lib/api';
import { useSearchParams, usePathname } from '@/tests/mocks/next-navigation';
import { useAuth } from '@/contexts/AuthContext';
import useServiceCategories from '@/hooks/useServiceCategories';

jest.mock('next/navigation', () => require('@/tests/mocks/next-navigation'));
jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');
jest.mock('@/hooks/useServiceCategories');

const mockedGetArtists = getArtists as jest.MockedFunction<typeof getArtists>;
const mockedUseAuth = useAuth as jest.Mock;
const mockedUseServiceCategories = useServiceCategories as jest.Mock;

describe('ArtistsPage', () => {
  beforeEach(() => {
    useSearchParams.mockReturnValue(new URLSearchParams('category=DJ'));
    usePathname.mockReturnValue('/');
    mockedUseAuth.mockReturnValue({ user: { id: 1, first_name: 'Test', email: 't@example.com' } });
    mockedUseServiceCategories.mockReturnValue([
      { id: 1, value: 'dj', label: 'DJ' },
      { id: 2, value: 'musician', label: 'Musician' },
    ]);
    mockedGetArtists.mockResolvedValue({
      data: [
        {
          id: 10,
          user: { first_name: 'DJ', last_name: 'One' },
          business_name: 'DJ One Biz',
          service_categories: ['DJ'],
        },
        {
          id: 11,
          user: { first_name: 'DJ', last_name: 'NoBiz' },
          service_categories: ['DJ'],
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
    expect(screen.getByText('DJ')).toBeTruthy();
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
