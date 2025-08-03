import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import LocationInput from '../LocationInput';

const mockGetPlacePredictions = jest.fn();

jest.mock('react-google-autocomplete/lib/usePlacesAutocompleteService', () => ({
  __esModule: true,
  default: () => ({
    placesService: null,
    placePredictions: [],
    getPlacePredictions: mockGetPlacePredictions,
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
    const input = getByRole('combobox');

    fireEvent.change(input, { target: { value: 'Cape Town' } });

    await waitFor(() => {
      expect(mockGetPlacePredictions).toHaveBeenCalledTimes(1);
      expect(mockGetPlacePredictions).toHaveBeenCalledWith(
        expect.objectContaining({ input: 'Cape Town' }),
      );
    });
  });
});
