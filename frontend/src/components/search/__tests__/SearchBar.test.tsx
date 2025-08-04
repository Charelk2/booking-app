import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import SearchBar from '../SearchBar';

// Mock next/dynamic to synchronously load a minimal SearchPopupContent
jest.mock('next/dynamic', () => () => {
  const Stub = ({ activeField }: { activeField: string }) =>
    activeField === 'location' ? <div role="dialog">Suggestions</div> : null;
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
  it('shows suggestions on focus and hides them on typing', async () => {
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

    const { getByPlaceholderText, queryAllByRole } = render(<Wrapper />);

    const input = getByPlaceholderText('Add location');
    fireEvent.focus(input);

    expect(queryAllByRole('dialog').length).toBeGreaterThan(0);

    fireEvent.change(input, { target: { value: 'Cape' } });

    await waitFor(() => expect(queryAllByRole('dialog').length).toBe(0));

    fireEvent.blur(input);
    fireEvent.focus(input);

    await waitFor(() => expect(queryAllByRole('dialog').length).toBe(0));
  });
});
