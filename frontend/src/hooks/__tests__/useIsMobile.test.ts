import { createRoot } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import useIsMobile from '../useIsMobile';
import { BREAKPOINT_SM } from '@/lib/breakpoints';

describe('useIsMobile', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let result = false;
  const query = `(max-width: ${BREAKPOINT_SM - 1}px)`;

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

  it('returns true when screen width is below sm breakpoint', async () => {
    Object.defineProperty(window, 'matchMedia', {
      value: jest.fn().mockImplementation((q) => ({
        matches: q === query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
      writable: true,
    });
    await act(async () => {
      root.render(React.createElement(Test));
    });
    await act(async () => {}); // flush useEffect
    expect(window.matchMedia).toHaveBeenCalledWith(query);
    expect(result).toBe(true);
  });

  it('returns false when screen width is sm breakpoint or wider', async () => {
    Object.defineProperty(window, 'matchMedia', {
      value: jest.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
      writable: true,
    });
    await act(async () => {
      root.render(React.createElement(Test));
    });
    await act(async () => {});
    expect(window.matchMedia).toHaveBeenCalledWith(query);
    expect(result).toBe(false);
  });
});
