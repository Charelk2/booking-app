import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { useForm, Control, FieldValues } from 'react-hook-form';
import VenueStep from '../VenueStep';

function Wrapper() {
  const { control } = useForm();
  return <VenueStep control={control as unknown as Control<FieldValues>} />;
}

describe('VenueStep bottom sheet', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
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

  function openSheet() {
    const button = container.querySelector('button') as HTMLButtonElement;
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  it('focus is trapped and sheet closes on Escape', () => {
    act(() => {
      root.render(React.createElement(Wrapper));
    });
    openSheet();
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('closes when clicking the overlay', () => {
    act(() => {
      root.render(React.createElement(Wrapper));
    });
    openSheet();
    const overlay = container.querySelector('[data-testid="overlay"]') as HTMLDivElement;
    act(() => {
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('uses dialog semantics', () => {
    act(() => {
      root.render(React.createElement(Wrapper));
    });
    openSheet();
    const dialog = container.querySelector('[role="dialog"]') as HTMLDivElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });
});
