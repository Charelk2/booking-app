import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import FilterSheet from '../FilterSheet';

jest.mock('@/components/ui', () => ({
  BottomSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="sheet">{children}</div> : null,
}));

jest.mock('@/components/ui/PriceFilter', () => function MockPriceFilter({
  onApply,
  onClear,
  onClose,
}: {
  onApply: (v: { minPrice: number; maxPrice: number; sort: string }) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <div>
      <button
        data-testid="apply"
        type="button"
        onClick={() => {
          onApply({ minPrice: 10, maxPrice: 20, sort: 'most_booked' });
          onClose();
        }}
      >
        apply
      </button>
      <button
        data-testid="clear"
        type="button"
        onClick={() => {
          onClear();
          onClose();
        }}
      >
        clear
      </button>
    </div>
  );
});

describe('FilterSheet PriceFilter integration', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('forwards apply and clear actions', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onApply = jest.fn();
    const onClear = jest.fn();
    const onClose = jest.fn();

    act(() => {
      root.render(
        <FilterSheet
          open
          onClose={onClose}
          initialSort=""
          initialMinPrice={0}
          initialMaxPrice={100}
          onApply={onApply}
          onClear={onClear}
          priceDistribution={[]}
        />,
      );
    });

    const applyBtn = container.querySelector('[data-testid="apply"]') as HTMLButtonElement;
    act(() => {
      applyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onApply).toHaveBeenCalledWith({ sort: 'most_booked', minPrice: 10, maxPrice: 20 });
    expect(onClose).toHaveBeenCalledTimes(1);

    const clearBtn = container.querySelector('[data-testid="clear"]') as HTMLButtonElement;
    act(() => {
      clearBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClear).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(2);

    act(() => root.unmount());
    container.remove();
  });
});
