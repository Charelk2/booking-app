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

  it('appends new message and clears input', () => {
    act(() => {
      root.render(<StickyInputDemo />);
    });

    const input = container.querySelector('input') as HTMLInputElement;
    const button = container.querySelector('button') as HTMLButtonElement;

    act(() => {
      input.value = 'Hello';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const messages = container.querySelectorAll('.bg-gray-100');
    expect(messages.length).toBe(1);
    expect(messages[0].textContent).toBe('Hello');
    expect(input.value).toBe('');
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
