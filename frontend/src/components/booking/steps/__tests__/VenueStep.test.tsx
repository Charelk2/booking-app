import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import { useForm, Control, FieldValues } from 'react-hook-form';
import VenueStep from '../VenueStep';

function Wrapper() {
  const { control } = useForm({ defaultValues: { venueType: 'indoor' } });
  return (
    <VenueStep
      control={control as unknown as Control<FieldValues>}
      step={2}
      steps={['one', 'two', 'three']}
      onBack={() => {}}
      onSaveDraft={() => {}}
      onNext={() => {}}
    />
  );
}

describe('VenueStep radio buttons', () => {
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
    expect(radios.length).toBe(3);
    const indoor = radios[0] as HTMLInputElement;
    const outdoor = radios[1] as HTMLInputElement;
    expect(indoor.checked).toBe(true);
    act(() => {
      outdoor.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(outdoor.checked).toBe(true);
  });
});
