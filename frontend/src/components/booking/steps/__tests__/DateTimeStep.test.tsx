import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import { useForm, Control, FieldValues } from 'react-hook-form';
import DateTimeStep from '../DateTimeStep';

function Wrapper() {
  const { control } = useForm({
    defaultValues: { date: new Date('2025-06-20') },
  });
  return (
    <DateTimeStep
      control={control as unknown as Control<FieldValues>}
      unavailable={[]}
      step={0}
      steps={['one']}
      onBack={() => {}}
      onSaveDraft={() => {}}
      onNext={() => {}}
    />
  );
}

function LoadingWrapper() {
  const { control } = useForm();
  return (
    <DateTimeStep
      control={control as unknown as Control<FieldValues>}
      unavailable={[]}
      loading
      step={0}
      steps={['one']}
      onBack={() => {}}
      onSaveDraft={() => {}}
      onNext={() => {}}
    />
  );
}

describe('DateTimeStep mobile input', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 500, writable: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    errorSpy.mockRestore();
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
  });

  it('shows formatted value without warnings', async () => {
    await act(async () => {
      root.render(React.createElement(Wrapper));
    });
    await act(async () => {});
    const input = container.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('2025-06-20');
    expect(input.className).toContain('input-field');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('renders a skeleton when loading', async () => {
    await act(async () => {
      root.render(React.createElement(LoadingWrapper));
    });
    const skeleton = container.querySelector('[data-testid="calendar-skeleton"]');
    expect(skeleton).not.toBeNull();
  });
});
