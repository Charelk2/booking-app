import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import React from 'react';
import PillButton from '../PillButton';

describe('PillButton component', () => {
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

  it('renders default and selected states with correct attributes/styles', () => {
    act(() => {
      root.render(<PillButton label="Demo" selected={false} onClick={() => {}} />);
    });
    const btn = container.querySelector('button') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('Demo');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    // Default (unselected) visual state
    expect(btn.className).toContain('h-11');
    expect(btn.style.backgroundColor).toBe('rgb(255, 255, 255)');

    act(() => {
      root.render(<PillButton label="Demo" selected onClick={() => {}} />);
    });
    const selectedBtn = container.querySelector('button') as HTMLButtonElement;
    expect(selectedBtn.getAttribute('aria-pressed')).toBe('true');
    // Selected state uses brand background and white text
    expect(selectedBtn.style.color).toBe('rgb(255, 255, 255)');
  });
});
