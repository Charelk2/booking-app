import { render, screen, fireEvent } from '@testing-library/react';
import HomeSearchForm from '../HomeSearchForm';
import { useRouter, useSearchParams } from 'next/navigation';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

describe('HomeSearchForm', () => {
  it('submits search with location and when params', () => {
    const push = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push });
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams());

    const { container } = render(<HomeSearchForm />);
    fireEvent.change(screen.getByPlaceholderText('Destination'), {
      target: { value: 'Cape Town' },
    });
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2025-07-20' } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    expect(push).toHaveBeenCalledWith('/artists?location=Cape+Town&when=2025-07-20');
  });

  it('initializes fields from search params', () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useSearchParams as jest.Mock).mockReturnValue(
      new URLSearchParams('location=Joburg&when=2025-08-01'),
    );

    const { container } = render(<HomeSearchForm />);
    const destInput = screen.getByPlaceholderText('Destination') as HTMLInputElement;
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;

    expect(destInput.value).toBe('Joburg');
    expect(dateInput.value).toBe('2025-08-01');
  });
});

