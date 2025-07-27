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

  it('renders steps and highlights the current one', () => {
    act(() => {
      root.render(<Stepper steps={["One", "Two", "Three"]} currentStep={1} />);
    });
    const wrapper = container.querySelector('div[role="list"]');
    expect(wrapper).not.toBeNull();
    const items = container.querySelectorAll('[role="listitem"]');
    expect(items).toHaveLength(3);
    expect(items[1].getAttribute('aria-current')).toBe('step');
    expect(items[0].getAttribute('aria-disabled')).toBe('true');
  });

  it('uses custom aria-label when provided', () => {
    act(() => {
      root.render(<Stepper steps={["One", "Two"]} currentStep={0} ariaLabel="Booking progress" />);
    });
    const wrapper = container.querySelector('div[role="list"]');
    expect(wrapper?.getAttribute('aria-label')).toBe('Booking progress');
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
    expect(buttons[2].getAttribute('aria-disabled')).toBeNull();
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
    expect(buttons[1].getAttribute('aria-disabled')).toBe('true');
    expect((buttons[2] as HTMLButtonElement).disabled).toBe(true);
    expect(buttons[2].getAttribute('aria-disabled')).toBe('true');
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

  it('uses brand colored border for the active step', () => {
    act(() => {
      root.render(<Stepper steps={["One", "Two", "Three"]} currentStep={1} />);
    });
    const circles = container.querySelectorAll('button div.relative');
    const activeCircle = circles[1] as HTMLDivElement;
    expect(activeCircle.className).toContain('border-[var(--brand-color)]');
    expect(activeCircle.className).toContain('border-2');
  });

  it('applies focus ring when navigating with the keyboard', () => {
    act(() => {
      root.render(
        <Stepper steps={["One", "Two"]} currentStep={0} onStepClick={() => {}} />,
      );
    });
    const button = container.querySelector('button') as HTMLButtonElement;
    act(() => {
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      button.focus();
    });
    expect(button.className).toContain('focus-visible:ring-2');
    expect(button.className).toContain('focus-visible:ring-[var(--brand-color-dark)]');
  });

  it('supports the neutral variant', () => {
    act(() => {
      root.render(
        <Stepper steps={["One", "Two"]} currentStep={1} variant="neutral" />,
      );
    });
    const circles = container.querySelectorAll('div.relative');
    const activeCircle = circles[1] as HTMLDivElement;
    expect(activeCircle.className).toContain('border-gray-900');
    expect(activeCircle.className).toContain('border-2');
  });
});
