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
    root.unmount();
    container.remove();
  });

  it('returns keyboard height when visualViewport shrinks', () => {
    const handlers: (() => void)[] = [];
    const vv = {
      height: 800,
      offsetTop: 0,
      addEventListener: (_: string, cb: () => void) => { handlers.push(cb); },
      removeEventListener: () => {},
    } as any;

    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true });
    Object.defineProperty(window, 'visualViewport', { value: vv, writable: true });

    act(() => {
      root.render(React.createElement(Test));
    });
    act(() => {}); // flush useEffect
    expect(result).toBe(0);

    vv.height = 600;
    handlers.forEach((cb) => cb());
    act(() => {});
    expect(result).toBe(200);
  });
});

