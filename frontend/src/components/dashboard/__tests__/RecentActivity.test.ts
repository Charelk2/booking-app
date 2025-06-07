import { createRoot } from 'react-dom/client';
import React from 'react';
import RecentActivity from '../RecentActivity';
import { act } from 'react-dom/test-utils';

describe('RecentActivity component', () => {
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

  it('shows placeholder when there are no events', () => {
    act(() => {
      root.render(React.createElement(RecentActivity, { events: [] }));
    });
    expect(container.textContent).toContain('You have no recent activity yet.');
  });
});
