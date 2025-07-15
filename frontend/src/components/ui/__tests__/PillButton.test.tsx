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

  it('matches snapshot for default and selected states', () => {
    act(() => {
      root.render(<PillButton label="Demo" selected={false} onClick={() => {}} />);
    });
    expect(container.firstChild).toMatchSnapshot();

    act(() => {
      root.render(<PillButton label="Demo" selected onClick={() => {}} />);
    });
    expect(container.firstChild).toMatchSnapshot();
  });
});
