import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import PriceFilter from '../PriceFilter';
import { useRouter, usePathname, useSearchParams, useParams } from '@/tests/mocks/next-navigation';


jest.mock('rheostat', () => {
  // simple mock slider with two inputs
  interface MockSliderProps {
    values: number[];
    onValuesUpdated: (state: { values: number[] }) => void;
    onChange?: (state: { values: number[] }) => void;
  }
  return function MockSlider({ values, onValuesUpdated, onChange }: MockSliderProps) {
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
          onClick={() => onChange?.({ values })}
        >
          commit
        </button>
      </div>
    );
  };
});

const push = jest.fn();
useRouter.mockReturnValue({ push });
usePathname.mockReturnValue('/artists');
const searchParamsMock: Pick<URLSearchParams, 'toString'> = {
  toString: () => '',
};
useSearchParams.mockReturnValue(searchParamsMock);
useParams.mockReturnValue({});

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
          sortOptions={[]}
          onSortChange={jest.fn()}
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

  it('focuses the close button and restores focus on close', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open';
    document.body.appendChild(trigger);
    trigger.focus();

    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    act(() => {
      root.render(
        <PriceFilter
          open
          initialMinPrice={0}
          initialMaxPrice={100}
          priceDistribution={[]}
          onApply={jest.fn()}
          onClear={jest.fn()}
          onClose={() => {
            root.render(
              <PriceFilter
                open={false}
                initialMinPrice={0}
                initialMaxPrice={100}
                priceDistribution={[]}
                onApply={jest.fn()}
                onClear={jest.fn()}
                onClose={jest.fn()}
                sortOptions={[]}
                onSortChange={jest.fn()}
              />,
            );
          }}
          sortOptions={[]}
          onSortChange={jest.fn()}
        />,
      );
    });

    const closeBtn = div.querySelector('button[aria-label="Close filters"]') as HTMLButtonElement;
    expect(document.activeElement).toBe(closeBtn);

    act(() => {
      closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.activeElement).toBe(trigger);

    act(() => root.unmount());
    div.remove();
    trigger.remove();
  });
});
