import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SelectCategoryPage from '../category/page';
import { getServiceCategories, updateMyArtistProfile } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');

const mockedGet = getServiceCategories as jest.MockedFunction<typeof getServiceCategories>;
const mockedUpdate = updateMyArtistProfile as jest.MockedFunction<typeof updateMyArtistProfile>;
const mockedUseAuth = useAuth as jest.Mock;

describe('SelectCategoryPage', () => {
  it('fetches and allows selecting a category', async () => {
    mockedGet.mockResolvedValue({
      data: [
        { id: 1, name: 'DJ', created_at: '', updated_at: '' },
      ],
    } as any);
    mockedUpdate.mockResolvedValue({} as any);
    mockedUseAuth.mockReturnValue({ refreshUser: jest.fn() });

    render(<SelectCategoryPage />);

    await screen.findByText('DJ');

    fireEvent.click(screen.getByText('DJ'));

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith({ service_category_id: 1 });
    });
  });
});
