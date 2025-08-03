import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import SearchBar from '../SearchBar';

// Mock next/dynamic to synchronously load a minimal SearchPopupContent
jest.mock('next/dynamic', () => () => {
  const Stub = ({
    activeField,
    locationInputRef,
  }: {
    activeField: string;
    locationInputRef: React.Ref<HTMLInputElement>;
  }) =>
    activeField === 'location' ? (
      <input ref={locationInputRef} placeholder="Search destinations" />
    ) : null;
  return Stub;
});

jest.mock('@/lib/loadPlaces', () => ({
  loadPlaces: () =>
    Promise.resolve({
      AutocompleteService: function () {
        this.getPlacePredictions = jest.fn();
      },
      PlacesService: function () {},
      AutocompleteSessionToken: function () {},
    }),
}));

describe('SearchBar', () => {
  it('keeps location popup open when clicking inside the input', async () => {
    const onSearch = jest.fn();
    const Wrapper = () => {
      const [category, setCategory] = React.useState(null);
      const [location, setLocation] = React.useState('');
      const [when, setWhen] = React.useState<Date | null>(null);
      return (
        <SearchBar
          category={category}
          setCategory={setCategory}
          location={location}
          setLocation={setLocation}
          when={when}
          setWhen={setWhen}
          onSearch={onSearch}
        />
      );
    };

    const { getByRole, getByPlaceholderText, queryByRole } = render(<Wrapper />);

    const whereButton = getByRole('button', { name: /where/i });
    fireEvent.click(whereButton);

    const input = await waitFor(() => getByPlaceholderText('Search destinations'));
    fireEvent.mouseDown(input);

    expect(queryByRole('dialog')).not.toBeNull();
  });
});
