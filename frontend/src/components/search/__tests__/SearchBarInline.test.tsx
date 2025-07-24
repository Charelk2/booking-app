import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import SearchBarInline from '../SearchBarInline';

jest.mock('react-google-autocomplete/lib/usePlacesAutocompleteService', () => () => ({
  placesService: null,
  placePredictions: [],
  getPlacePredictions: jest.fn(),
}));

describe('SearchBarInline', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('expands and triggers onSearch', () => {
    const onSearch = jest.fn();
    const onChange = jest.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<SearchBarInline onSearch={onSearch} onExpandedChange={onChange} />);
    });

    const trigger = container.querySelector('button') as HTMLButtonElement;
    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith(true);

    const searchBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(searchBtn).not.toBeNull();

    act(() => {
      searchBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith(false);

    expect(onSearch).toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });

  it('closes on Escape without searching', () => {
    const onSearch = jest.fn();
    const onChange = jest.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<SearchBarInline onSearch={onSearch} onExpandedChange={onChange} />);
    });

    const trigger = container.querySelector('button') as HTMLButtonElement;
    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith(true);

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith(false);

    const searchBtn = container.querySelector('button[type="submit"]');
    expect(searchBtn).toBeNull();
    expect(onSearch).not.toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });
});
