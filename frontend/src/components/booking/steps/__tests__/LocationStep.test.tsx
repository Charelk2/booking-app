import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import { useForm, Control, FieldValues } from 'react-hook-form';
import LocationStep from '../LocationStep';

jest.mock('react-google-autocomplete/lib/usePlacesAutocompleteService', () => {
  const React = require('react');
  return () => {
    const [preds, setPreds] = React.useState<any[]>([]);
    return {
      placesService: {
        getDetails: (_opts: any, cb: (p: any) => void) =>
          cb({
            geometry: { location: { lat: () => 1, lng: () => 2 } },
            formatted_address: 'Test',
          }),
      },
      placePredictions: preds,
      getPlacePredictions: () =>
        setPreds([
          {
            place_id: '1',
            description: 'Test',
            structured_formatting: { main_text: 'Test', secondary_text: 'SA' },
          },
        ]),
    };
  };
});

function Wrapper() {
  const { control } = useForm();
  return (
    <LocationStep
      control={control as unknown as Control<FieldValues>}
      setWarning={() => {}}
      step={1}
      steps={['one', 'two']}
      artistLocation={null}
      onBack={() => {}}
      onSaveDraft={() => {}}
      onNext={() => {}}
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
    });
    const input = container.querySelector('input') as HTMLInputElement;
    await act(async () => {
      input.value = 'Test';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const option = container.querySelector('[data-testid="location-option"]') as HTMLDivElement;
    await act(async () => {
      option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="map"]')).not.toBeNull();
  });

  it('reveals tooltip on focus', async () => {
    await act(async () => {
      root.render(React.createElement(Wrapper));
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
