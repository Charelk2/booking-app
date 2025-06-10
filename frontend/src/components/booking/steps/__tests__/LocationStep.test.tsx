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
    const mock = (global as { mockAutocomplete: jest.Mock }).mockAutocomplete;
    const instance = mock.mock.instances[0];
    instance.getPlace.mockReturnValue({
      geometry: { location: { lat: () => 1, lng: () => 2 } },
      formatted_address: 'Test',
    });
    await act(async () => {
      instance._cb();
    });
    expect(container.querySelector('[data-testid="map"]')).not.toBeNull();
  });
});
