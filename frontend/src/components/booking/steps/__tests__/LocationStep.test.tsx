import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import { useForm, Control, FieldValues } from 'react-hook-form';
import LocationStep from '../LocationStep';

function Wrapper() {
  const { control } = useForm();
  return (
    <LocationStep control={control as unknown as Control<FieldValues>} setWarning={() => {}} />
  );
}

describe('LocationStep selection', () => {
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

  it('shows map after selecting a place', async () => {
    await act(async () => {
      root.render(React.createElement(Wrapper));
    });
    const input = container.querySelector('input') as HTMLInputElement;
    const event = new Event('gmp-select') as Event & {
      placePrediction?: { toPlace: () => { fetchFields: jest.Mock; formattedAddress: string; location: { lat: number; lng: number } } };
    };
    event.placePrediction = {
      toPlace: () => ({
        fetchFields: jest.fn().mockResolvedValue(undefined),
        formattedAddress: 'Test',
        location: { lat: 1, lng: 2 },
      }),
    };
    await act(async () => {
      input.dispatchEvent(event);
    });
    await act(async () => {});
    expect(container.querySelector('[data-testid="map"]')).not.toBeNull();
  });
});
