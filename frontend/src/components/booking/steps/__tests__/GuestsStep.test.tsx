import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import { useForm, Control, FieldValues } from 'react-hook-form';
import { GuestsStep } from '../../wizard/Steps';

function Wrapper() {
  const { control } = useForm({ defaultValues: { guests: '' } });
  return <GuestsStep control={control as unknown as Control<FieldValues>} />;
}

describe('GuestsStep input', () => {
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

  it('renders number input', () => {
    act(() => {
      root.render(React.createElement(Wrapper));
    });
    const input = container.querySelector('input[type="number"]') as HTMLInputElement;
    expect(input).not.toBeNull();
  });

  it('renders number input', () => {
    act(() => {
      root.render(React.createElement(Wrapper));
    });
    const input = container.querySelector('input[type="number"]') as HTMLInputElement;
    expect(input).not.toBeNull();
  });
});
