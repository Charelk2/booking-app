import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import PriceFilter from '../PriceFilter';
import { useRouter, usePathname, useSearchParams, useParams } from '@/tests/mocks/next-navigation';


jest.mock('rheostat', () => {
  interface MockSliderProps {
    values: number[];
    onValuesUpdated: (state: { values: number[] }) => void;
  }
  return function MockSlider({ values, onValuesUpdated }: MockSliderProps) {
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
  it('applies prices and updates router', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    const onApply = jest.fn();
    await act(async () => {
      root.render(
        <PriceFilter
          open
          initialMinPrice={0}
          initialMaxPrice={100}
          priceDistribution={[]}
          onApply={onApply}
          onClear={jest.fn()}
          onClose={jest.fn()}
          sortOptions={[]}
          onSortChange={jest.fn()}
        />,
      );
    });

    const applyBtn = Array.from(div.querySelectorAll('button')).find(
      (b) => b.textContent === 'Apply',
    ) as HTMLButtonElement;

    await act(async () => {
      applyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onApply).toHaveBeenCalledWith({ minPrice: 0, maxPrice: 100 });
    expect(push).toHaveBeenCalled();

    await act(async () => root.unmount());
    div.remove();
  });

  it('focuses the close button and restores focus on close', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open';
    document.body.appendChild(trigger);
    trigger.focus();

    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
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

    await act(async () => {
      closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.activeElement).toBe(trigger);

    await act(async () => root.unmount());
    div.remove();
    trigger.remove();
  });
});
