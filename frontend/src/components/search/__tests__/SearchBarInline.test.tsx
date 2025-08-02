import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import SearchBarInline from '../SearchBarInline';

jest.mock('@/lib/loadPlaces', () => ({
  loadPlaces: () => Promise.resolve({}),
}));

jest.mock('react-google-autocomplete/lib/usePlacesAutocompleteService', () => () => ({
  placesService: null,
  placePredictions: [],
  getPlacePredictions: jest.fn(),
}));

describe('SearchBarInline', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('triggers onSearch when submitted', async () => {
    const onSearch = jest.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SearchBarInline onSearch={onSearch} />);
      await Promise.resolve();
    });

    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await act(async () => {
      submit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(onSearch).toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });

  it('shows initial parameters', async () => {
    const onSearch = jest.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SearchBarInline
          onSearch={onSearch}
          initialCategory="dj"
          initialLocation="Cape Town"
          initialWhen={new Date('2025-05-01')}
        />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain('DJ');
    expect(container.textContent).toContain('Cape Town');
    expect(container.textContent).toMatch(/May\s+1,\s+2025/);

    act(() => root.unmount());
    container.remove();
  });
});

