import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import QuoteTemplatesPage from '../quote-templates/page';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');
// eslint-disable-next-line react/display-name
jest.mock('@/components/layout/MainLayout', () => ({ children }: { children: React.ReactNode }) => <div>{children}</div>);

describe('QuoteTemplatesPage', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: 'service_provider' } });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('lists templates', async () => {
    (api.getQuoteTemplates as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          artist_id: 1,
          name: 'Base',
          services: [],
          sound_fee: 0,
          travel_fee: 0,
          accommodation: null,
          discount: null,
          created_at: '',
          updated_at: '',
        },
      ],
    });
    render(<QuoteTemplatesPage />);
    expect(await screen.findByText('Base')).toBeTruthy();
  });

  it('creates a template', async () => {
    (api.getQuoteTemplates as jest.Mock).mockResolvedValue({ data: [] });
    (api.createQuoteTemplate as jest.Mock).mockResolvedValue({
      data: {
        id: 2,
        artist_id: 1,
        name: 'New',
        services: [{ description: 'a', price: 1 }],
        sound_fee: 0,
        travel_fee: 0,
        accommodation: null,
        discount: null,
        created_at: '',
        updated_at: '',
      },
    });
    render(<QuoteTemplatesPage />);
    const nameInput = await screen.findByLabelText(/name/i);
    fireEvent.change(nameInput, { target: { value: 'New' } });
    fireEvent.change(screen.getByPlaceholderText('Description'), { target: { value: 'a' } });
    fireEvent.change(screen.getByPlaceholderText('Price'), { target: { value: '1' } });
    fireEvent.click(screen.getByText('Add Template'));
    expect(await screen.findByText('New')).toBeTruthy();
    expect(api.createQuoteTemplate).toHaveBeenCalled();
  });
});
