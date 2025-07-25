import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import FilterSheet from '../FilterSheet';

jest.mock('@/hooks/useMediaQuery', () => jest.fn(() => true));

describe('FilterSheet sliders', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('calls onPriceChange when sliders move', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const modalRoot = document.createElement('div');
    modalRoot.id = 'modal-root';
    document.body.appendChild(modalRoot);
    const root = createRoot(container);
    const onPriceChange = jest.fn();

    act(() => {
      root.render(
        <FilterSheet
          open
          onClose={jest.fn()}
          sort=""
          onSort={jest.fn()}
          onClear={jest.fn()}
          onApply={jest.fn()}
          minPrice={0}
          maxPrice={100}
          onPriceChange={onPriceChange}
          priceDistribution={[]}
        />,
      );
    });

    const ranges = modalRoot.querySelectorAll('input[type="range"]');
    const minInput = ranges[0] as HTMLInputElement;
    const maxInput = ranges[1] as HTMLInputElement;

    act(() => {
      minInput.value = '20';
      minInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onPriceChange).toHaveBeenCalledWith(20, 100);

    act(() => {
      maxInput.value = '80';
      maxInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onPriceChange).toHaveBeenLastCalledWith(20, 80);

    act(() => root.unmount());
    container.remove();
    modalRoot.remove();
  });
});
