import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SelectCategoryPage from '../category/page';
import { getServiceCategories, updateMyArtistProfile } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn(() => ({ refreshUser: jest.fn() })) }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const mockCategories = [{ id: 1, name: 'Photography' }];

describe('SelectCategoryPage', () => {
  beforeEach(() => {
    (getServiceCategories as jest.Mock).mockResolvedValue({ data: mockCategories });
  });

  it('renders categories', async () => {
    render(<SelectCategoryPage />);
    expect(await screen.findByText('Photography')).toBeInTheDocument();
  });

  it('submits selected category', async () => {
    (updateMyArtistProfile as jest.Mock).mockResolvedValue({});
    render(<SelectCategoryPage />);
    const option = await screen.findByText('Photography');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(updateMyArtistProfile).toHaveBeenCalledWith({ service_category_id: 1 });
    });
  });
});
