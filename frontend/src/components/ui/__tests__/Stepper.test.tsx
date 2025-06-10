import { createRoot } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import Stepper from '../Stepper';

describe('Stepper progress bar', () => {
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

  it('is sticky on mobile', () => {
    Object.defineProperty(window, 'innerWidth', { value: 500, writable: true });
    act(() => {
      root.render(<Stepper steps={["One", "Two"]} currentStep={0} />);
    });
    const div = container.querySelector('div');
    expect(div?.className).toContain('sticky');
  });

  it('shows step names and highlights the current one', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, writable: true });
    act(() => {
      root.render(<Stepper steps={["One", "Two", "Three"]} currentStep={1} />);
    });
    const spans = container.querySelectorAll('span');
    expect(spans[1].className).toContain('font-bold');
    expect(container.textContent).toContain('Three');
  });
});
