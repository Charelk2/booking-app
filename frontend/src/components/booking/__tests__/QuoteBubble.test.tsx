import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import QuoteBubble from '../QuoteBubble';

describe('QuoteBubble', () => {
  it('matches snapshot', () => {
    const div = document.createElement('div');
    const root = createRoot(div);

    act(() => {
      root.render(
        <QuoteBubble
          description="Performance"
          price={100}
          soundFee={10}
          travelFee={20}
          accommodation="Hotel"
          discount={5}
          subtotal={125}
          total={130}
          status="Pending"
        />,
      );
    });

    expect(div.firstChild).toMatchSnapshot();

    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
