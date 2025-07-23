import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import React from 'react';
import useMediaQuery from '../useMediaQuery';

describe('useMediaQuery', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let matches = false;

  function Test() {
    matches = useMediaQuery('(max-width:500px)');
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

  it('returns true when query matches', async () => {
    Object.defineProperty(window, 'matchMedia', {
      value: jest.fn().mockImplementation((q) => ({
        matches: q === '(max-width:500px)',
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
      writable: true,
    });
    await act(async () => {
      root.render(React.createElement(Test));
    });
    expect(matches).toBe(true);
  });
});
