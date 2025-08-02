import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import SearchBarExpanded from '../SearchBarExpanded';

jest.mock('@/lib/loadPlaces', () => ({
  loadPlaces: () => Promise.resolve({}),
}));

jest.mock('react-google-autocomplete/lib/usePlacesAutocompleteService', () => () => ({
  placesService: null,
  placePredictions: [],
  getPlacePredictions: jest.fn(),
}));

describe('SearchBarExpanded', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('focuses location input on open', async () => {
    jest.useFakeTimers();
    const onSearch = jest.fn();
    const onClose = jest.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SearchBarExpanded open onClose={onClose} onSearch={onSearch} />);
      await Promise.resolve();
    });

    act(() => {
      jest.runAllTimers();
    });

    const input = container.querySelector('input');
    expect(document.activeElement).toBe(input);

    jest.useRealTimers();
    act(() => root.unmount());
    container.remove();
  });

  it('calls onSearch with values on submit', async () => {
    const onSearch = jest.fn();
    const onClose = jest.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SearchBarExpanded
          open
          onClose={onClose}
          onSearch={onSearch}
          initialLocation="Cape Town"
          initialGuests={2}
        />,
      );
      await Promise.resolve();
    });

    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true }));
    });

    expect(onSearch).toHaveBeenCalledWith({ location: 'Cape Town', when: null, guests: 2 });
    expect(onClose).toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });

  it('closes when clicking overlay and close button', async () => {
    const onSearch = jest.fn();
    const onClose = jest.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SearchBarExpanded open onClose={onClose} onSearch={onSearch} />);
      await Promise.resolve();
    });

    const overlay = container.querySelector('[data-testid="search-expanded-overlay"]') as HTMLDivElement;
    act(() => {
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(<SearchBarExpanded open onClose={onClose} onSearch={onSearch} />);
      await Promise.resolve();
    });

    const closeBtn = container.querySelector('button[aria-label="Close search"]') as HTMLButtonElement;
    act(() => {
      closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);

    act(() => root.unmount());
    container.remove();
  });
});
