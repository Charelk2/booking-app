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

  it('shows map after selecting a place', async () => {
    await act(async () => {
      root.render(React.createElement(Wrapper));
      await Promise.resolve();
    });
    const input = container.querySelector('input') as HTMLInputElement;
    jest.useFakeTimers();
    await act(async () => {
      input.value = 'Test';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      jest.advanceTimersByTime(350);
    });
    const option = container.querySelector('[data-testid="location-option"]') as HTMLDivElement;
    await act(async () => {
      option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="map"]')).not.toBeNull();
    jest.useRealTimers();
  });

  it('toggles map container classes without layout jumps', async () => {
    await act(async () => {
      root.render(React.createElement(Wrapper));
      await Promise.resolve();
    });
    const mapDiv = container.querySelector('[data-testid="map-container"]') as HTMLDivElement;
    expect(mapDiv.className).toContain('map-container-collapsed');
    const input = container.querySelector('input') as HTMLInputElement;
    jest.useFakeTimers();
    await act(async () => {
      input.value = 'Test';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      jest.advanceTimersByTime(350);
    });
    const option = container.querySelector('[data-testid="location-option"]') as HTMLDivElement;
    await act(async () => {
      option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(mapDiv.className).toContain('map-container-expanded');
    expect(mapDiv.className).not.toContain('map-container-collapsed');
    jest.useRealTimers();
  });

  it('reveals tooltip on focus', async () => {
    await act(async () => {
      root.render(React.createElement(Wrapper));
      await Promise.resolve();
    });
    const tooltipButton = container.querySelector('button[aria-describedby]') as HTMLButtonElement;
    act(() => {
      tooltipButton.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
      tooltipButton.focus();
    });
    const tip = container.querySelector('[role="tooltip"]');
    expect(tip).not.toBeNull();
  });
});
