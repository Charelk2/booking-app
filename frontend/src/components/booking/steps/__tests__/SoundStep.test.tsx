import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import { useForm, Control, FieldValues } from 'react-hook-form';
import { SoundStep } from '../../wizard/Steps';

jest.mock('@/contexts/BookingContext', () => ({
  useBooking: jest.fn(() => ({
    details: { sound: 'yes' },
    setDetails: jest.fn(),
    serviceId: 1,
  })),
  BookingProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function Wrapper() {
  const { control, setValue } = useForm({ defaultValues: { sound: 'yes' } });
  return <SoundStep control={control as unknown as Control<FieldValues>} setValue={setValue as any} />;
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
    const radios = container.querySelectorAll('input[type="radio"][name="sound"]');
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
