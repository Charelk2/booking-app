import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import SelectableCard from '../SelectableCard';

describe('SelectableCard component', () => {
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
      root.render(
        <SelectableCard
          name="demo"
          value="a"
          label="Option"
          onChange={() => {}}
        />,
      );
    });
    expect(container.firstChild).toMatchSnapshot();

    act(() => {
      root.render(
        <SelectableCard
          name="demo"
          value="a"
          label="Option"
          checked
          onChange={() => {}}
        />,
      );
    });
    expect(container.firstChild).toMatchSnapshot();
  });
});
