import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import DashboardTabs from '../DashboardTabs';

describe('DashboardTabs', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it('calls onChange when tab clicked', () => {
    const onChange = jest.fn();
    act(() => {
      root.render(
        React.createElement(DashboardTabs, {
          tabs: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
          ],
          active: 'a',
          onChange,
        })
      );
    });
    const btn = container.querySelectorAll('button')[1] as HTMLButtonElement;
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
