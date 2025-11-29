import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import { useForm, Control, FieldValues } from 'react-hook-form';
import { LocationStep } from '../../wizard/Steps';

jest.mock('@/lib/loadPlaces', () => ({
  loadPlaces: () =>
    Promise.resolve({
      AutocompleteService: function () {
        this.getPlacePredictions = (_opts: any, cb: (r: any[]) => void) =>
          cb([
            {
              place_id: '1',
              description: 'Test',
              structured_formatting: { main_text: 'Test', secondary_text: 'SA' },
            },
          ]);
      },
      PlacesService: function () {
        this.getDetails = (_opts: any, cb: any) =>
          cb(
            {
              geometry: { location: { lat: () => 1, lng: () => 2 } },
              formatted_address: 'Test',
            },
            (global as any).google.maps.places.PlacesServiceStatus.OK,
          );
      },
      AutocompleteSessionToken: function () {},
    }),
}));

beforeAll(() => {
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key';
});

function Wrapper() {
  const { control } = useForm();
  return (
    <LocationStep
      control={control as unknown as Control<FieldValues>}
      setWarning={() => {}}
      artistLocation={null}
    />
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

  it('renders location input and help text', async () => {
    await act(async () => {
      root.render(React.createElement(Wrapper));
      await Promise.resolve();
    });
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(container.textContent).toContain('Event location');
    expect(container.textContent).toContain('Start typing to see suggestions');
  });

  it('shows helper text and exposes listbox semantics', async () => {
    await act(async () => {
      root.render(React.createElement(Wrapper));
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Start typing to see suggestions');
    const combobox = container.querySelector('input[role="combobox"]') as HTMLInputElement;
    expect(combobox).not.toBeNull();
    expect(combobox.getAttribute('aria-controls')).toBeTruthy();
  });
});
