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

  it('shows step names and highlights the current one', () => {
    act(() => {
      root.render(<Stepper steps={["One", "Two", "Three"]} currentStep={1} />);
    });
    const spans = container.querySelectorAll('span');
    expect(spans[1].className).toContain('font-medium');
    expect(container.textContent).toContain('Three');
  });

  it('calls onStepClick for previous steps', () => {
    const clickSpy = jest.fn();
    act(() => {
      root.render(
        <Stepper
          steps={["One", "Two", "Three"]}
          currentStep={2}
          onStepClick={clickSpy}
        />,
      );
    });
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    act(() => {
      buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(clickSpy).toHaveBeenCalledWith(0);
  });
});
