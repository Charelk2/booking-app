import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import ReviewStep from '../ReviewStep';
import { useBooking } from '@/contexts/BookingContext';

jest.mock('@/contexts/BookingContext');

describe('ReviewStep summary', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.clearAllMocks();
  });

  it('renders estimated cost with sound row', async () => {
    (useBooking as jest.Mock).mockReturnValue({ details: {} });

    await act(async () => {
      root.render(
        <ReviewStep
          isLoadingReviewData={false}
          reviewDataError={null}
          step={0}
          steps={['Review']}
          onBack={() => {}}
          onSaveDraft={async () => {}}
          onNext={async () => {}}
          submitting={false}
          baseServicePrice={100}
          travelResult={{ mode: 'drive', totalCost: 50, breakdown: { drive: { estimate: 50 } } }}
          soundCost={20}
          soundMode="external_providers"
          soundModeOverridden={false}
        />,
      );
    });

    expect(container.textContent).toContain('Sound Equipment');
    expect(container.textContent).toContain('Estimated Total');
  });
});
