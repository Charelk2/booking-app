import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import React from 'react';
import IconButton from '../IconButton';

describe('IconButton component', () => {
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

  it('applies provided aria-label', () => {
    act(() => {
      root.render(
        <IconButton aria-label="menu">
          <svg />
        </IconButton>,
      );
    });
    const button = container.querySelector('button');
    expect(button?.getAttribute('aria-label')).toBe('menu');
  });
});
