import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import React from 'react';
import Avatar from '../Avatar';

describe('Avatar component', () => {
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

  it('matches snapshot for default placeholder', () => {
    act(() => {
      root.render(<Avatar />);
    });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with initials', () => {
    act(() => {
      root.render(<Avatar initials="A" />);
    });
    expect(container.firstChild).toMatchSnapshot();
  });
});
