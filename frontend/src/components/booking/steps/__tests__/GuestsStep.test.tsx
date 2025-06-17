import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import { useForm, Control, FieldValues } from 'react-hook-form';
import GuestsStep from '../GuestsStep';

function Wrapper({ onNext = () => {} }: { onNext?: () => void }) {
  const { control } = useForm({ defaultValues: { guests: '' } });
  return (
    <GuestsStep
      control={control as unknown as Control<FieldValues>}
      step={2}
      steps={['one', 'two', 'three']}
      onBack={() => {}}
      onSaveDraft={() => {}}
      onNext={onNext}
    />
  );
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

  it('calls onNext when Next clicked', () => {
    const nextSpy = jest.fn();
    act(() => {
      root.render(React.createElement(Wrapper, { onNext: nextSpy }));
    });
    const nextButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Next') || b.textContent?.includes('Submit'),
    ) as HTMLButtonElement;
    act(() => {
      nextButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(nextSpy).toHaveBeenCalled();
  });
});
