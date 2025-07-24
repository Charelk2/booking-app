import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import SearchBar from '../SearchBar';
import { UI_CATEGORIES } from '@/lib/categoryMap';

describe('SearchBar', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('calls onSearch with values on submit', async () => {
    const onSearch = jest.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SearchBar
          category={UI_CATEGORIES[0]}
          setCategory={() => {}}
          location="Cape Town"
          setLocation={() => {}}
          when={null}
          setWhen={() => {}}
          onSearch={onSearch}
        />,
      );
    });

    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true }));
    });

    expect(onSearch).toHaveBeenCalledWith({
      category: UI_CATEGORIES[0].value,
      location: 'Cape Town',
      when: null,
    });

    act(() => root.unmount());
    container.remove();
  });
});
