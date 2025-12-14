import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import PriceFilter from '../PriceFilter';

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

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

describe('PriceFilter', () => {
  it('applies current values and closes', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    const onApply = jest.fn();
    const onClose = jest.fn();
    await act(async () => {
      root.render(
        <PriceFilter
          open
          initialMinPrice={0}
          initialMaxPrice={100}
          priceDistribution={[]}
          onApply={onApply}
          onClear={jest.fn()}
          onClose={onClose}
          sortOptions={[
            { value: '', label: 'Best match' },
            { value: 'most_booked', label: 'Most booked' },
          ]}
        />,
      );
    });

    const applyBtn = Array.from(div.querySelectorAll('button')).find(
      (b) => b.textContent === 'Apply',
    ) as HTMLButtonElement;

    await act(async () => {
      applyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onApply).toHaveBeenCalledWith({ minPrice: 0, maxPrice: 100, sort: '' });
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    div.remove();
  });

  it('includes sort selection when applying', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    const onApply = jest.fn();
    const onClose = jest.fn();
    await act(async () => {
      root.render(
        <PriceFilter
          open
          initialMinPrice={0}
          initialMaxPrice={100}
          priceDistribution={[]}
          onApply={onApply}
          onClear={jest.fn()}
          onClose={onClose}
          sortOptions={[
            { value: '', label: 'Best match' },
            { value: 'most_booked', label: 'Most booked' },
          ]}
        />,
      );
    });

    const select = div.querySelector('#sheet-sort') as HTMLSelectElement;
    await act(async () => {
      select.value = 'most_booked';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const applyBtn = Array.from(div.querySelectorAll('button')).find(
      (b) => b.textContent === 'Apply',
    ) as HTMLButtonElement;

    await act(async () => {
      applyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onApply).toHaveBeenCalledWith({ minPrice: 0, maxPrice: 100, sort: 'most_booked' });
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    div.remove();
  });

  it('clears values and closes', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    const onClear = jest.fn();
    const onClose = jest.fn();

    await act(async () => {
      root.render(
        <PriceFilter
          open
          initialMinPrice={0}
          initialMaxPrice={100}
          priceDistribution={[]}
          onApply={jest.fn()}
          onClear={onClear}
          onClose={onClose}
          sortOptions={[{ value: '', label: 'Best match' }]}
        />,
      );
    });

    const clearBtn = Array.from(div.querySelectorAll('button')).find(
      (b) => b.textContent === 'Clear all',
    ) as HTMLButtonElement;

    await act(async () => {
      clearBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    div.remove();
  });
});
