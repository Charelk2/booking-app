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

  it('expands and triggers onSearch', async () => {
    const onSearch = jest.fn();
    const onChange = jest.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SearchBarInline onSearch={onSearch} onExpandedChange={onChange} />);
      await Promise.resolve();
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

  it('closes on Escape without searching', async () => {
    const onSearch = jest.fn();
    const onChange = jest.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SearchBarInline onSearch={onSearch} onExpandedChange={onChange} />);
      await Promise.resolve();
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

  it('location label does not wrap and is truncated', async () => {
    const onSearch = jest.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SearchBarInline onSearch={onSearch} />);
      await Promise.resolve();
    });

    const locationDiv = container.querySelector('button > div:nth-child(2)') as HTMLDivElement;
    expect(locationDiv.className).toMatch(/whitespace-nowrap/);
    expect(locationDiv.className).toMatch(/overflow-hidden/);
    expect(locationDiv.className).toMatch(/text-ellipsis/);

    act(() => root.unmount());
    container.remove();
  });

  it('uses smaller max width when collapsed and expands to full width', async () => {
    const onSearch = jest.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SearchBarInline onSearch={onSearch} />);
      await Promise.resolve();
    });

    const wrapper = container.querySelector('div') as HTMLDivElement;
    expect(wrapper.className).toMatch(/max-w-2xl/);
    expect(wrapper.className).not.toMatch(/max-w-4xl/);

    const trigger = container.querySelector('button') as HTMLButtonElement;
    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(wrapper.className).toMatch(/max-w-4xl/);

    act(() => root.unmount());
    container.remove();
  });
});
