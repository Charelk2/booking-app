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
  it('shows suggestions on click and hides them on escape', async () => {
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

    const { getByText, getByRole, queryAllByRole } = render(<Wrapper />);

    const button = getByText('Add location');
    fireEvent.click(button);

    expect(queryAllByRole('dialog').length).toBeGreaterThan(0);

    const form = getByRole('search');
    fireEvent.keyDown(form, { key: 'Escape' });

    await waitFor(() => expect(queryAllByRole('dialog').length).toBe(0));
  });
});
