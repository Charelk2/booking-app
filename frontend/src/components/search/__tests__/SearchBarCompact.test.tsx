import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import SearchBarCompact from '../SearchBarCompact';

describe('SearchBarCompact', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders default placeholders', async () => {
    const onOpen = jest.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SearchBarCompact onOpen={onOpen} />);
    });

    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toContain('Choose category');
    expect(button.textContent).toContain('Anywhere');
    expect(button.textContent).toContain('Add\u00A0date');

    act(() => root.unmount());
    container.remove();
  });

  it('updates placeholders when props change', async () => {
    const onOpen = jest.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const when = new Date('2025-04-01T00:00:00.000Z');

    await act(async () => {
      root.render(
        <SearchBarCompact
          onOpen={onOpen}
          category="Music"
          location="Cape Town"
          when={when}
        />
      );
    });

    let button = container.querySelector('button') as HTMLButtonElement;
    let text = button.textContent?.replace(/\u00A0/g, ' ');
    expect(text).toContain('Music');
    expect(text).toContain('Cape Town');
    expect(text).toContain('1 Apr 2025');

    const newWhen = new Date('2025-05-02T00:00:00.000Z');

    await act(async () => {
      root.render(
        <SearchBarCompact
          onOpen={onOpen}
          category="Dance"
          location="Johannesburg"
          when={newWhen}
        />
      );
    });

    button = container.querySelector('button') as HTMLButtonElement;
    text = button.textContent?.replace(/\u00A0/g, ' ');
    expect(text).toContain('Dance');
    expect(text).toContain('Johannesburg');
    expect(text).toContain('2 May 2025');

    act(() => root.unmount());
    container.remove();
  });

  it('fires onOpen when clicked', async () => {
    const onOpen = jest.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SearchBarCompact onOpen={onOpen} />);
    });

    const button = container.querySelector('button') as HTMLButtonElement;
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onOpen).toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });
});

