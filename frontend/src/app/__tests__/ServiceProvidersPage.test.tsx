import { render, screen, waitFor } from '@testing-library/react';
import ServiceProvidersPage from '../service-providers/page';
import { getServiceProviders } from '@/lib/api';
import { useSearchParams, usePathname } from '@/tests/mocks/next-navigation';
import { useAuth } from '@/contexts/AuthContext';
import useServiceCategories from '@/hooks/useServiceCategories';

jest.mock('next/navigation', () => require('@/tests/mocks/next-navigation'));
jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');
jest.mock('@/hooks/useServiceCategories');

const mockedGetServiceProviders = getServiceProviders as jest.MockedFunction<typeof getServiceProviders>;
const mockedUseAuth = useAuth as jest.Mock;
const mockedUseServiceCategories = useServiceCategories as jest.Mock;

describe('ServiceProvidersPage', () => {
  beforeEach(() => {
    useSearchParams.mockReturnValue(new URLSearchParams('category=DJ'));
    usePathname.mockReturnValue('/');
    mockedUseAuth.mockReturnValue({ user: { id: 1, first_name: 'Test', email: 't@example.com' } });
    mockedUseServiceCategories.mockReturnValue([
      { id: 1, value: 'dj', label: 'DJ' },
      { id: 2, value: 'musician', label: 'Musician' },
    ]);
    mockedGetServiceProviders.mockResolvedValue({
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
    render(<ServiceProvidersPage />);
    await waitFor(() => expect(mockedGetServiceProviders).toHaveBeenCalledTimes(1));
    expect(mockedGetServiceProviders).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'DJ' }),
    );

    await screen.findByText('DJ One Biz');
    expect(screen.queryByText('DJ NoBiz')).toBeNull();
  });

  it('normalizes UI slug category query param', async () => {
    useSearchParams.mockReturnValue(new URLSearchParams('category=dj'));
    render(<ServiceProvidersPage />);
    await waitFor(() => expect(mockedGetServiceProviders).toHaveBeenCalledTimes(1));
    expect(mockedGetServiceProviders).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'DJ' }),
    );
  });

  it('derives category from /category path', async () => {
    useSearchParams.mockReturnValue(new URLSearchParams());
    usePathname.mockReturnValue('/category/dj');
    render(<ServiceProvidersPage />);
    await waitFor(() => expect(mockedGetServiceProviders).toHaveBeenCalledTimes(1));
    expect(mockedGetServiceProviders).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'DJ' }),
    );
  });
});
