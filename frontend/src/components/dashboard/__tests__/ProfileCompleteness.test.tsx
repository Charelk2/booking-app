import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import { ProfileCompleteness, computeProfileCompleteness } from '..';

describe('ProfileCompleteness component', () => {
  it('computes completion percentage correctly', () => {
    expect(computeProfileCompleteness(3, 5)).toBe(60);
  });

  it('renders progress bar with width', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<ProfileCompleteness stepsCompleted={5} totalSteps={5} />);
    });

    const inner = container.querySelector('[data-testid="profile-completeness"] div') as HTMLDivElement;
    expect(inner.style.width).toBe('100%');

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
