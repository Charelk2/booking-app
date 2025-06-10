import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import React from 'react';
import useKeyboardOffset from '../useKeyboardOffset';

let result = 0;

function Test() {
  result = useKeyboardOffset();
  return null;
}

describe('useKeyboardOffset', () => {
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

  it('returns keyboard height when visualViewport shrinks', () => {
    const handlers: (() => void)[] = [];
    const vv = {
      height: 800,
      offsetTop: 0,
      addEventListener: (_: string, cb: () => void) => { handlers.push(cb); },
      removeEventListener: () => {},
    } as unknown as VisualViewport;

    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true });
    Object.defineProperty(window, 'visualViewport', { value: vv, writable: true });

    act(() => {
      root.render(React.createElement(Test));
    });
    act(() => {}); // flush useEffect
    expect(result).toBe(0);

    vv.height = 600;
    act(() => {
      handlers.forEach((cb) => cb());
    });
    expect(result).toBe(200);
  });

  it('falls back to resize events when visualViewport is missing', () => {
    Object.defineProperty(window, 'visualViewport', { value: undefined, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true });

    act(() => {
      root.render(React.createElement(Test));
    });
    act(() => {});
    expect(result).toBe(0);

    const input = document.createElement('input');
    document.body.appendChild(input);
    act(() => {
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });

    Object.defineProperty(window, 'innerHeight', { value: 700, writable: true });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(result).toBe(100);

    act(() => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(result).toBe(0);
    input.remove();
  });
});

