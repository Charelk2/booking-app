import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import TextInput from '../TextInput';

describe('TextInput component', () => {
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

  it('uses provided id for label and input', () => {
    act(() => {
      root.render(<TextInput label="Name" id="email" />);
    });
    const label = container.querySelector('label') as HTMLLabelElement;
    const input = container.querySelector('input') as HTMLInputElement;
    expect(label.htmlFor).toBe('email');
    expect(input.id).toBe('email');
  });

  it('generates id when none is provided', () => {
    act(() => {
      root.render(<TextInput label="First" />);
    });
    const label = container.querySelector('label') as HTMLLabelElement;
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.id).toBeTruthy();
    expect(label.htmlFor).toBe(input.id);
  });

  it('generates unique ids for multiple instances', () => {
    act(() => {
      root.render(
        <>
          <TextInput label="One" />
          <TextInput label="Two" />
        </>,
      );
    });
    const inputs = container.querySelectorAll('input');
    expect(inputs).toHaveLength(2);
    expect(inputs[0].id).not.toBe(inputs[1].id);
  });

  it('applies brand colored focus styles', () => {
    act(() => {
      root.render(<TextInput label="Email" />);
    });
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.className).toContain('focus:border-[var(--brand-color)]');
    expect(input.className).toContain('focus:ring-[var(--brand-color)]');
  });
});
