import { renderHook, waitFor } from '@testing-library/react';
import { useLiveQuotePrefill } from '../useLiveQuotePrefill';

// Mock API calls used inside the hook
jest.mock('@/lib/api', () => ({
  livePerformanceEstimate: jest.fn().mockResolvedValue({ data: { base_fee: 5000, travel_cost: 800, sound_cost: 1200 } }),
  getBookingRequestCached: jest.fn(),
  getService: jest.fn(),
}));

describe('useLiveQuotePrefill', () => {
  const setServiceFee = jest.fn();
  const setTravelFee = jest.fn();
  const setSoundFee = jest.fn();
  const setIsSupplierParent = jest.fn();
  const setLoadingCalc = jest.fn();

  const defaultArgs = {
    bookingRequestId: 1,
    dirtyService: false,
    dirtyTravel: false,
    dirtySound: false,
    initialBaseFee: undefined,
    initialTravelCost: undefined,
    initialSoundNeeded: undefined,
    initialSoundCost: undefined,
    calculationParams: undefined,
    setServiceFee,
    setTravelFee,
    setSoundFee,
    setIsSupplierParent,
    setLoadingCalc,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prefills sound fee for artist_provides_variable even when sound_mode is supplier', async () => {
    const { getBookingRequestCached } = require('@/lib/api');
    getBookingRequestCached.mockResolvedValue({
      id: 1,
      service_id: 10,
      travel_mode: 'drive',
      travel_breakdown: {
        sound_mode: 'supplier',
        sound_required: true,
        travel_mode: 'drive',
      },
      service: {
        price: 7000,
        details: {
          sound_provisioning: {
            mode: 'artist_provides_variable',
            price_driving_sound_zar: 1500,
            price_flying_sound_zar: 3000,
          },
        },
      },
    });

    renderHook(() => useLiveQuotePrefill(defaultArgs));

    await waitFor(() => {
      expect(setIsSupplierParent).toHaveBeenCalledWith(false);
      expect(setSoundFee).toHaveBeenCalledWith(1500);
    });
  });
});
