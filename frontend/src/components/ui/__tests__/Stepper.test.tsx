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

  it('calls onStepClick when clicking completed steps', () => {
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
    expect(buttons).toHaveLength(3);
    act(() => {
      buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(clickSpy).toHaveBeenCalledWith(0);

    act(() => {
      buttons[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(clickSpy).not.toHaveBeenCalledWith(2);
  });

  it('allows clicking a future step once completed previously', () => {
    const clickSpy = jest.fn();
    act(() => {
      root.render(
        <Stepper
          steps={["One", "Two", "Three"]}
          currentStep={1}
          maxStepCompleted={2}
          onStepClick={clickSpy}
        />,
      );
    });
    const buttons = container.querySelectorAll('button');
    expect((buttons[2] as HTMLButtonElement).disabled).toBe(false);
    act(() => {
      buttons[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(clickSpy).toHaveBeenCalledWith(2);
  });

  it('disables buttons for future steps', () => {
    act(() => {
      root.render(
        <Stepper
          steps={["One", "Two", "Three"]}
          currentStep={0}
          onStepClick={() => {}}
        />,
      );
    });
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(3);
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(true);
    expect((buttons[2] as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows default cursor on the current step', () => {
    act(() => {
      root.render(
        <Stepper steps={["One", "Two", "Three"]} currentStep={1} onStepClick={() => {}} />,
      );
    });
    const buttons = container.querySelectorAll('button');
    expect(buttons[1].className).toContain('cursor-default');
    expect(buttons[1].className).not.toContain('cursor-not-allowed');
  });
});
