import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import React from 'react';
import Stepper from '../Stepper';

describe('Stepper responsive layout', () => {
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

  it('renders mobile progress when width < 640px', () => {
    Object.defineProperty(window, 'innerWidth', { value: 500, writable: true });
    act(() => {
      root.render(<Stepper steps={["One", "Two"]} currentStep={0} />);
    });
    expect(container.textContent).toContain('1/2');
  });

  it('renders desktop layout when width >= 640px', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, writable: true });
    act(() => {
      root.render(<Stepper steps={["One", "Two"]} currentStep={1} />);
    });
    expect(container.textContent).toContain('Two');
  });
});
