import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react';
import LocationInput from '../LocationInput';

const mockGetPlacePredictions = jest.fn();

jest.mock('@/lib/loadPlaces', () => ({
  loadPlaces: () =>
    Promise.resolve({
      AutocompleteService: function () {
        this.getPlacePredictions = mockGetPlacePredictions;
      },
      PlacesService: function () {},
      AutocompleteSessionToken: function () {},
    }),
}));

beforeAll(() => {
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key';
});

describe('LocationInput', () => {
  it('calls getPlacePredictions once when value changes', async () => {
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
});
