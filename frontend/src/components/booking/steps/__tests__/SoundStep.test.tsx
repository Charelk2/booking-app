import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import { useForm, Control, FieldValues } from 'react-hook-form';
import { SoundStep } from '../../wizard/Steps';

function Wrapper() {
  const { control } = useForm({ defaultValues: { sound: 'yes' } });
  return <SoundStep control={control as unknown as Control<FieldValues>} />;
}

describe('SoundStep radio buttons', () => {
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

  it('renders options and updates selection', () => {
    act(() => {
      root.render(React.createElement(Wrapper));
    });
    const radios = container.querySelectorAll('input[type="radio"]');
    expect(radios.length).toBe(2);
    const yes = radios[0] as HTMLInputElement;
    const no = radios[1] as HTMLInputElement;
    expect(yes.checked).toBe(true);
    act(() => {
      no.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(no.checked).toBe(true);
  });
});
