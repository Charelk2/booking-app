import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react';
const mockGetPlacePredictions = jest.fn();
const mockLoadPlaces = jest.fn(() =>
  Promise.resolve({
    AutocompleteService: function () {
      this.getPlacePredictions = mockGetPlacePredictions;
    },
    PlacesService: function () {},
    AutocompleteSessionToken: function () {},
  }),
);

jest.mock('@/lib/loadPlaces', () => ({
  loadPlaces: mockLoadPlaces,
}));

beforeAll(() => {
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key';
});

beforeEach(() => {
  mockGetPlacePredictions.mockClear();
  mockLoadPlaces.mockClear();
});

describe('LocationInput', () => {
  it('calls getPlacePredictions once when value changes', async () => {
    const { default: LocationInput } = await import('../LocationInput');

    const Wrapper = () => {
      const [value, setValue] = React.useState('');
      return (
        <LocationInput
          value={value}
          onValueChange={setValue}
          onPlaceSelect={jest.fn()}
        />
      );
    };

    const { getByRole } = render(<Wrapper />);
    await act(async () => {});
    const input = getByRole('combobox');

    jest.useFakeTimers();
    fireEvent.change(input, { target: { value: 'Cape Town' } });
    act(() => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(mockGetPlacePredictions).toHaveBeenCalledTimes(1);
      expect(mockGetPlacePredictions.mock.calls[0][0]).toEqual(
        expect.objectContaining({ input: 'Cape Town' }),
      );
    });
    jest.useRealTimers();
  });

  it('fetches predictions when typing before Places API loads', async () => {
    let resolveLoader: (v: unknown) => void = () => {};
    mockLoadPlaces.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLoader = resolve;
        }),
    );

    const { default: LazyLocationInput } = await import('../LocationInput');

    const Wrapper = () => {
      const [value, setValue] = React.useState('');
      return (
        <LazyLocationInput
          value={value}
          onValueChange={setValue}
          onPlaceSelect={jest.fn()}
        />
      );
    };

    const { getByRole } = render(<Wrapper />);
    const input = getByRole('combobox');

    jest.useFakeTimers();
    fireEvent.change(input, { target: { value: 'Cape Town' } });

    await act(async () => {
      resolveLoader({
        AutocompleteService: function () {
          this.getPlacePredictions = mockGetPlacePredictions;
        },
        PlacesService: function () {},
        AutocompleteSessionToken: function () {},
      });
    });

    act(() => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(mockGetPlacePredictions).toHaveBeenCalledTimes(1);
    });
    jest.useRealTimers();
  });

  it('supports keyboard navigation and retains hover styling', async () => {
    mockGetPlacePredictions.mockImplementationOnce((_, cb) => {
      cb([
        {
          description: 'Cape Town, South Africa',
          structured_formatting: {
            main_text: 'Cape Town',
            secondary_text: 'South Africa',
          },
          place_id: '1',
        },
        {
          description: 'Johannesburg, South Africa',
          structured_formatting: {
            main_text: 'Johannesburg',
            secondary_text: 'South Africa',
          },
          place_id: '2',
        },
      ]);
    });

    const { default: LocationInput } = await import('../LocationInput');

    const Wrapper = () => {
      const [value, setValue] = React.useState('');
      return (
        <LocationInput
          value={value}
          onValueChange={setValue}
          onPlaceSelect={jest.fn()}
        />
      );
    };

    const { getByRole, getAllByTestId } = render(<Wrapper />);
    const input = getByRole('combobox');

    jest.useFakeTimers();
    fireEvent.change(input, { target: { value: 'South' } });
    act(() => {
      jest.advanceTimersByTime(350);
    });
    jest.useRealTimers();

    await waitFor(() => {
      expect(getAllByTestId('location-option').length).toBe(2);
    });

    fireEvent.keyDown(input, { key: 'ArrowDown' });

    const options = getAllByTestId('location-option');
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(options[1].className).toContain('hover:bg-gray-50');
    expect(options[0].className).toContain('min-h-[44px]');
  });
});
