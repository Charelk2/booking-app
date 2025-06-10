import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import useIsMobile from '../useIsMobile';
import React from 'react';

describe('useIsMobile', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let result = false;

  function Test() {
    result = useIsMobile();
    return null;
  }

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

  it('returns true when window width is below 640', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 500, writable: true });
    await act(async () => {
      root.render(React.createElement(Test));
    });
    await act(async () => {}); // flush useEffect
    expect(result).toBe(true);
  });

  it('returns false when window width is 640 or more', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, writable: true });
    await act(async () => {
      root.render(React.createElement(Test));
    });
    await act(async () => {});
    expect(result).toBe(false);
  });
});
