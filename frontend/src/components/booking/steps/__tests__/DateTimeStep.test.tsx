import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import { useForm, Control } from 'react-hook-form';
import type { EventDetails } from '@/contexts/BookingContext';
import { DateTimeStep } from '../../wizard/Steps';

function Wrapper() {
  const { control } = useForm<EventDetails>({
    defaultValues: { date: new Date('2025-06-20') },
  });
  return (
    <DateTimeStep
      control={control as Control<EventDetails>}
      unavailable={[]}
    />
  );
}

function LoadingWrapper() {
  const { control } = useForm<EventDetails>();
  return (
    <DateTimeStep
      control={control as Control<EventDetails>}
      unavailable={[]}
      loading
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
    expect(input.className).toContain('input-base');
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
