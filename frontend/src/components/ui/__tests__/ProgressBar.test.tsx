import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ProgressBar from '../ProgressBar';

describe('ProgressBar', () => {
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

  it('sets width according to value prop', () => {
    act(() => {
      root.render(<ProgressBar value={42} />);
    });
    const outer = container.querySelector('div[role="progressbar"]');
    expect(outer).not.toBeNull();
    const inner = outer!.firstElementChild as HTMLDivElement;
    expect(inner.style.width).toBe('42%');
  });
});
