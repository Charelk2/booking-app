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

  it('applies updated prices', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const modalRoot = document.createElement('div');
    modalRoot.id = 'modal-root';
    document.body.appendChild(modalRoot);
    const root = createRoot(container);
    const onApply = jest.fn();

    act(() => {
      root.render(
        <FilterSheet
          open
          onClose={jest.fn()}
          initialSort=""
          initialMinPrice={0}
          initialMaxPrice={100}
          onApply={onApply}
          onClear={jest.fn()}
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

    act(() => {
      maxInput.value = '80';
      maxInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const applyButton = modalRoot.querySelector('button.bg-brand') as HTMLButtonElement;
    act(() => {
      applyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onApply).toHaveBeenCalledWith({ sort: undefined, minPrice: 20, maxPrice: 80 });

    act(() => root.unmount());
    container.remove();
    modalRoot.remove();
  });
});
