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
  return function MockSlider({ values, onValuesUpdated, onChange }: any) {
    return (
      <div>
        <input
          data-testid="min"
          type="range"
          value={values[0]}
          onChange={(e) => {
            const val = Number(e.target.value);
            onValuesUpdated({ values: [val, values[1]] });
          }}
        />
        <input
          data-testid="max"
          type="range"
          value={values[1]}
          onChange={(e) => {
            const val = Number(e.target.value);
            onValuesUpdated({ values: [values[0], val] });
          }}
        />
        <button
          data-testid="commit"
          type="button"
          onClick={() => onChange({ values })}
        >
          commit
        </button>
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
    act(() => {
      root.render(
        <PriceFilter
          open
          initialMinPrice={0}
          initialMaxPrice={100}
          priceDistribution={[]}
          onApply={onApply}
          onClear={jest.fn()}
        />,
      );
    });

    const minInput = div.querySelector('[data-testid="min"]') as HTMLInputElement;
    const maxInput = div.querySelector('[data-testid="max"]') as HTMLInputElement;
    const commitBtn = div.querySelector('[data-testid="commit"]') as HTMLButtonElement;

    act(() => {
      minInput.value = '20';
      minInput.dispatchEvent(new Event('input', { bubbles: true }));
      maxInput.value = '80';
      maxInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    act(() => {
      commitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onApply).toHaveBeenCalledWith({ minPrice: 20, maxPrice: 80 });
    expect(push).toHaveBeenCalledWith('/artists?price_min=20&price_max=80');

    act(() => root.unmount());
    div.remove();
  });
});
