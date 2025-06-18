import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import Spinner from '../Spinner';

describe('Spinner component', () => {
  it('matches snapshot', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Spinner />);
    });

    expect(container.firstChild).toMatchSnapshot();

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
