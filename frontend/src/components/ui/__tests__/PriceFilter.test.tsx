import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import PriceFilter from '../PriceFilter';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
  useSearchParams: jest.fn(),
  useParams: jest.fn(),
}));

jest.mock('rheostat', () => {
  // simple mock slider with two inputs
  return function MockSlider({ values, onValuesUpdated }: any) {
    let current = [...values];
    return (
      <div>
        <input
          data-testid="min"
          type="range"
          value={current[0]}
          onChange={(e) => {
            current[0] = Number(e.target.value);
            onValuesUpdated({ values: current });
          }}
        />
        <input
          data-testid="max"
          type="range"
          value={current[1]}
          onChange={(e) => {
            current[1] = Number(e.target.value);
            onValuesUpdated({ values: current });
          }}
        />
      </div>
    );
  };
});

const push = jest.fn();
(useRouter as jest.Mock).mockReturnValue({ push });
(usePathname as jest.Mock).mockReturnValue('/artists');
(useSearchParams as jest.Mock).mockReturnValue({
  toString: () => '',
});

afterEach(() => {
  document.body.innerHTML = '';
  push.mockReset();
});

describe('PriceFilter', () => {
  it('applies prices and updates router', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    const onApply = jest.fn();
    const onClose = jest.fn();
    act(() => {
      root.render(
        <PriceFilter
          open
          initialMinPrice={0}
          initialMaxPrice={100}
          priceDistribution={[]}
          onApply={onApply}
          onClear={jest.fn()}
          onClose={onClose}
        />,
      );
    });

    act(() => {
      root.render(
        <PriceFilter
          open
          initialMinPrice={20}
          initialMaxPrice={80}
          priceDistribution={[]}
          onApply={onApply}
          onClear={jest.fn()}
          onClose={onClose}
        />,
      );
    });
    

    const applyBtn = Array.from(div.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Apply',
    ) as HTMLButtonElement;
    act(() => {
      applyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onApply).toHaveBeenCalledWith({ minPrice: 20, maxPrice: 80 });
    expect(push).toHaveBeenCalledWith('/artists?price_min=20&price_max=80');
    expect(onClose).toHaveBeenCalled();

    act(() => root.unmount());
    div.remove();
  });
});
