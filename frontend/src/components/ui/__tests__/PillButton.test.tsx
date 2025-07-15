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

  it('renders default styles', () => {
    act(() => {
      root.render(<PillButton label="Test" />);
    });
    const btn = container.querySelector('button') as HTMLButtonElement;
    expect(btn.className).toContain('h-10');
    expect(btn.className).toContain('px-4');
    expect(btn.className).toContain('mx-1');
    expect(btn.className).toContain('rounded-full');
    expect(btn.className).toContain('bg-white');
    expect(btn.className).toContain('text-gray-700');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows selected state', () => {
    act(() => {
      root.render(<PillButton label="Active" selected />);
    });
    const btn = container.querySelector('button') as HTMLButtonElement;
    expect(btn.className).toContain('bg-indigo-600');
    expect(btn.className).toContain('text-white');
    expect(btn.className).not.toContain('ring-gray-200');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });
});
