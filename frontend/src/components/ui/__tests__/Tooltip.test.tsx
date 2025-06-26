import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import Tooltip from '../Tooltip';

describe('Tooltip component', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows text on focus', () => {
    act(() => {
      root.render(<Tooltip text="Hello" />);
    });
    const button = container.querySelector('button') as HTMLButtonElement;
    act(() => {
      button.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
      button.focus();
    });
    const tip = container.querySelector('[role="tooltip"]') as HTMLElement;
    expect(tip).not.toBeNull();
    expect(tip.textContent).toBe('Hello');
  });

  it('shows text on hover', () => {
    act(() => {
      root.render(<Tooltip text="World" />);
    });
    const button = container.querySelector('button') as HTMLButtonElement;
    act(() => {
      button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    const tip = container.querySelector('[role="tooltip"]') as HTMLElement;
    expect(tip).not.toBeNull();
    expect(tip.textContent).toBe('World');
  });
});
