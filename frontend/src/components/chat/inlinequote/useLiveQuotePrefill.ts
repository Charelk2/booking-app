import { useEffect } from 'react';
import { ServiceItem } from '@/types';
import { calculateQuoteBreakdown, getBookingRequestCached, getService } from '@/lib/api';

interface UseLiveQuotePrefillArgs {
  bookingRequestId: number;
  dirtyService: boolean;
  dirtyTravel: boolean;
  dirtySound: boolean;
  initialBaseFee?: number;
  initialTravelCost?: number;
  initialSoundNeeded?: boolean;
  initialSoundCost?: number;
  calculationParams?: {
    base_fee: number;
    distance_km: number;
    service_id: number;
    event_city: string;
    accommodation_cost?: number;
  };
  setServiceFee: (v: number) => void;
  setTravelFee: (v: number) => void;
  setSoundFee: (v: number) => void;
  setIsSupplierParent: (v: boolean) => void;
  setLoadingCalc: (v: boolean) => void;
}

export function useLiveQuotePrefill({
  bookingRequestId,
  dirtyService,
  dirtyTravel,
  dirtySound,
  initialBaseFee,
  initialTravelCost,
  initialSoundNeeded,
  initialSoundCost,
  calculationParams,
  setServiceFee,
  setTravelFee,
  setSoundFee,
  setIsSupplierParent,
  setLoadingCalc,
}: UseLiveQuotePrefillArgs) {
  // Initial sound/base/travel from props (for late-arriving props)
  useEffect(() => {
    if (!dirtySound && initialSoundCost == null && initialSoundNeeded) {
      setSoundFee(1000);
    } else if (!dirtySound && initialSoundCost != null) {
      setSoundFee(initialSoundCost);
    }
  }, [initialSoundCost, initialSoundNeeded, dirtySound, setSoundFee]);

  useEffect(() => {
    if (typeof initialBaseFee === 'number' && !dirtyService) {
      setServiceFee(initialBaseFee);
    }
  }, [initialBaseFee, dirtyService, setServiceFee]);

  useEffect(() => {
    if (typeof initialTravelCost === 'number' && !dirtyTravel) {
      setTravelFee(initialTravelCost);
    }
  }, [initialTravelCost, dirtyTravel, setTravelFee]);

  // Prefill from backend calculator if provided
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!calculationParams) return;
      try {
        setLoadingCalc(true);
        const { data } = await calculateQuoteBreakdown(calculationParams);
        if (cancelled) return;
        if (initialBaseFee == null && !dirtyService) {
          setServiceFee(calculationParams.base_fee ?? (data as any)?.base_fee ?? 0);
        }
        if (initialTravelCost == null && !dirtyTravel) {
          setTravelFee(Number((data as any)?.travel_cost || 0));
        }
        if (initialSoundCost == null && initialSoundNeeded == null && !dirtySound) {
          setSoundFee(Number((data as any)?.sound_cost || 0));
        }
      } catch {
      } finally {
        if (!cancelled) setLoadingCalc(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [
    calculationParams,
    initialBaseFee,
    initialTravelCost,
    initialSoundCost,
    initialSoundNeeded,
    dirtyService,
    dirtyTravel,
    dirtySound,
    setServiceFee,
    setTravelFee,
    setSoundFee,
    setLoadingCalc,
  ]);

  // Direct prefill: booking-request details (service price, travel, sound, refined calculator)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const br: any = await getBookingRequestCached(bookingRequestId);
        if (!active) return;
        const tb: any = br.travel_breakdown || {};
        const soundModeRaw = tb.sound_mode || (br as any)?.sound_mode;
        const parentId = Number(br.parent_booking_request_id || 0);
        const supplierParent =
          !Number.isNaN(parentId) &&
          parentId <= 0 &&
          typeof soundModeRaw === 'string' &&
          String(soundModeRaw).toLowerCase() === 'supplier';
        setIsSupplierParent(supplierParent);

        const svcId = Number(br.service_id || 0);
        const svcPrice = Number(br?.service?.price);

        if (!dirtyService) {
          if (Number.isFinite(svcPrice) && svcPrice >= 0) {
            setServiceFee(svcPrice);
          } else if (Number.isFinite(svcId) && svcId > 0) {
            try {
              const svc = await getService(svcId);
              if (!active) return;
              const price2 = Number((svc.data as any)?.price);
              if (Number.isFinite(price2)) setServiceFee(price2);
            } catch {
            }
          }
        }

        if (!dirtyTravel) {
          const travelRaw = Number(tb.travel_cost ?? tb.travel_fee ?? br.travel_cost);
          if (Number.isFinite(travelRaw)) setTravelFee(travelRaw);
        }

        if (!dirtySound && !supplierParent) {
          try {
            const soundRequired = Boolean(tb.sound_required);
            const provisioning = (br?.service as any)?.details?.sound_provisioning;
            const rawMode = String((br as any)?.travel_mode || tb.travel_mode || tb.mode || '').toLowerCase();
            const mode = rawMode === 'flight' ? 'fly' : rawMode === 'driving' ? 'drive' : rawMode;
            let soundCost: number | undefined = undefined;
            if (soundRequired && provisioning?.mode === 'artist_provides_variable') {
              const drive = Number(provisioning?.price_driving_sound_zar ?? provisioning?.price_driving_sound ?? 0);
              const fly = Number(provisioning?.price_flying_sound_zar ?? provisioning?.price_flying_sound ?? 0);
              soundCost = mode === 'fly' ? fly : drive;
            } else if (soundRequired && tb.sound_cost) {
              const sc = Number(tb.sound_cost);
              soundCost = Number.isFinite(sc) ? sc : undefined;
            }
            if (Number.isFinite(soundCost)) setSoundFee(soundCost as number);
          } catch {
          }
        }

        try {
          const distance = Number(tb.distance_km ?? tb.distanceKm);
          const eventCity = tb.event_city || br.event_city || '';
          if (eventCity && Number.isFinite(Number(br.service_id))) {
            let baseForCalc = Number.isFinite(Number(br?.service?.price)) ? Number(br?.service?.price) : 0;
            const params: any = {
              base_fee: Number(baseForCalc || 0),
              service_id: Number(br.service_id),
              event_city: String(eventCity),
              ...(tb.accommodation_cost ? { accommodation_cost: Number(tb.accommodation_cost) } : {}),
            };
            if (Number.isFinite(distance) && distance > 0) {
              params.distance_km = Number(distance);
            }

            try {
              const { data } = await calculateQuoteBreakdown(params);
              if (!active) return;
              if (!dirtyService && typeof initialBaseFee !== 'number') {
                setServiceFee(Number((data as any)?.base_fee || baseForCalc || 0));
              }
              if (!dirtyTravel && typeof initialTravelCost !== 'number') {
                setTravelFee(Number((data as any)?.travel_cost || 0));
              }
              if (!dirtySound && initialSoundCost == null && initialSoundNeeded == null && !supplierParent) {
                setSoundFee(Number((data as any)?.sound_cost || 0));
              }
            } catch {
            }
          }
        } catch {
        }
      } catch {
      }
    })();
    return () => {
      active = false;
    };
  }, [
    bookingRequestId,
    dirtyService,
    dirtyTravel,
    dirtySound,
    initialBaseFee,
    initialTravelCost,
    initialSoundCost,
    initialSoundNeeded,
    setIsSupplierParent,
    setServiceFee,
    setTravelFee,
    setSoundFee,
  ]);
}

