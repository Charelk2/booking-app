import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import StickyInputDemo from '../StickyInputDemo';


describe('StickyInputDemo', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    // @ts-expect-error jsdom lacks scrollIntoView
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    jest.clearAllMocks();
  });

  it.skip('appends new message and clears input', () => {
    act(() => {
      root.render(<StickyInputDemo />);
    });

    const form = container.querySelector('form') as HTMLFormElement;
    const input = container.querySelector('input') as HTMLInputElement;

    act(() => {
      input.value = 'Hello';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(input.value).toBe('');
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
