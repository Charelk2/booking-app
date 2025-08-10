import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react';
import SearchBar from '../SearchBar';
import { UI_CATEGORIES } from '@/lib/categoryMap';

// Mock next/dynamic to synchronously load a minimal SearchPopupContent
jest.mock('next/dynamic', () => () => {
  const Stub: React.FC<{ activeField: string }> = ({ activeField }) => (
    <div>{activeField}</div>
  );
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
  it('keeps suggestions visible when typing in location', async () => {
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

    await waitFor(() => expect(queryAllByRole('dialog').length).toBeGreaterThan(0));
  });

  it('dismisses popup with a single outside click and allows interactions', async () => {
    jest.useFakeTimers();
    const onSearch = jest.fn();
    const outsideClick = jest.fn();

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

    const { getByPlaceholderText, queryByRole, getByTestId } = render(
      <>
        <Wrapper />
        <div
          data-testid="outside"
          onMouseDown={outsideClick}
          onClick={outsideClick}
          style={{ height: 100 }}
        >
          Outside
        </div>
      </>,
    );

    const input = getByPlaceholderText('Add location');
    fireEvent.focus(input);
    expect(queryByRole('dialog')).not.toBeNull();

    const outside = getByTestId('outside');
    fireEvent.mouseDown(outside);
    fireEvent.click(outside);

    // Allow the internal close timeout to elapse
    act(() => {
      jest.advanceTimersByTime(250);
    });

    await waitFor(() => expect(queryByRole('dialog')).toBeNull());
    expect(outsideClick).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('keeps popup content when switching fields quickly', () => {
    jest.useFakeTimers();
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

    const { getByRole, getByText } = render(<Wrapper />);

    const categoryButton = getByRole('button', { name: /Category/ });
    const whenButton = getByRole('button', { name: /When/ });

    fireEvent.click(categoryButton);
    fireEvent.click(whenButton);
    fireEvent.click(categoryButton);

    // Flush pending timers to simulate transition completion
    act(() => {
      jest.runAllTimers();
    });

    expect(getByText('category')).not.toBeNull();

    jest.useRealTimers();
  });

  it('shows category clear button only after a category is selected', () => {
    const Wrapper = () => {
      const [category, setCategory] = React.useState(null);
      const [location, setLocation] = React.useState('');
      const [when, setWhen] = React.useState<Date | null>(null);
      return (
        <>
          <SearchBar
            category={category}
            setCategory={setCategory}
            location={location}
            setLocation={setLocation}
            when={when}
            setWhen={setWhen}
            onSearch={jest.fn()}
          />
          <button
            type="button"
            data-testid="select-category"
            onClick={() => setCategory(UI_CATEGORIES[0])}
          >
            select
          </button>
        </>
      );
    };

    const { queryByLabelText, getByTestId } = render(<Wrapper />);

    expect(queryByLabelText('Clear Category')).toBeNull();

    fireEvent.click(getByTestId('select-category'));

    expect(queryByLabelText('Clear Category')).not.toBeNull();
  });
});
