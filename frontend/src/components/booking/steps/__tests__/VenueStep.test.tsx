import { flushPromises } from "@/test/utils/flush";
import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import { useForm, Control, FieldValues } from 'react-hook-form';
import { VenueStep } from '../../wizard/Steps';
import useIsMobile from '@/hooks/useIsMobile';

jest.mock('@/hooks/useIsMobile', () => jest.fn(() => false));


function MobileWrapper() {
  const { control } = useForm({ defaultValues: { venueType: 'indoor' } });
  return <VenueStep control={control as unknown as Control<FieldValues>} />;
}

function Wrapper() {
  const { control } = useForm({ defaultValues: { venueType: 'indoor' } });
  return <VenueStep control={control as unknown as Control<FieldValues>} />;
}

describe('VenueStep radio buttons', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (useIsMobile as jest.Mock).mockReturnValue(false);
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

describe('VenueStep bottom sheet mobile', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (useIsMobile as jest.Mock).mockReturnValue(true);
    Object.defineProperty(window, 'innerWidth', { value: 500, writable: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
  });

  it('opens sheet and restores focus', async () => {
    await act(async () => {
      root.render(React.createElement(MobileWrapper));
    });
    const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
    const openButton = buttons.find((b) => b.textContent?.includes('Venue')) as HTMLButtonElement;
    act(() => {
      openButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();
    const sheet = document.querySelector('[data-testid="bottom-sheet"]');
    expect(sheet).not.toBeNull();
    const outdoor = sheet?.querySelector('input[value="outdoor"]') as HTMLInputElement;
    act(() => {
      outdoor.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.querySelector('[data-testid="bottom-sheet"]')).toBeNull();
    await flushPromises();
    expect(document.activeElement).toBe(openButton);
  });
});
