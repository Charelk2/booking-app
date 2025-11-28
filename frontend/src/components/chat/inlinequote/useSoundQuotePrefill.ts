import { useEffect, useRef } from 'react';
import { ServiceItem } from '@/types';
import { soundEstimate, getBookingRequestCached } from '@/lib/api';
import { getDrivingMetricsCached } from '@/lib/travel';

interface UseSoundQuotePrefillArgs {
  bookingRequestId: number;
  isSoundService: boolean;
  dirtyTravel: boolean;
  dirtyService: boolean;
  items: (ServiceItem & { key: string })[];
  setItems: (items: (ServiceItem & { key: string })[]) => void;
  setServiceFee: (v: number) => void;
  setTravelFee: (v: number | ((prev: number) => number)) => void;
}

export function useSoundQuotePrefill({
  bookingRequestId,
  isSoundService,
  dirtyTravel,
  dirtyService,
  items,
  setItems,
  setServiceFee,
  setTravelFee,
}: UseSoundQuotePrefillArgs) {
  const hasSoundEstimateRef = useRef(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!bookingRequestId || !isSoundService) return;
        if (hasSoundEstimateRef.current) return;

        const br: any = await getBookingRequestCached(bookingRequestId);
        if (!active) return;
        const tb: any = br.travel_breakdown || {};
        const svcId = Number(br.service_id || 0);
        if (!Number.isFinite(svcId) || svcId <= 0) return;

        const guests = Number(tb.guests_count);
        const venueType = String(tb.venue_type || '').toLowerCase() || 'indoor';
        const stageRequired = Boolean(tb.stage_required);
        const stageSize = stageRequired && tb.stage_size ? String(tb.stage_size) : null;
        const lightingEvening = Boolean(tb.lighting_evening);
        const upgradeAdv = Boolean(tb.upgrade_lighting_advanced);

        const tbRiderUnits = (tb as any)?.rider_units;
        const tbBacklineRequested = (tb as any)?.backline_requested;

        const ru: any = tbRiderUnits || {};
        const toInt = (v: unknown): number => {
          const n = Number(v);
          return Number.isFinite(n) && n > 0 ? n : 0;
        };
        const riderUnits = {
          vocal_mics: toInt(ru.vocal_mics ?? ru.vocalMics),
          speech_mics: toInt(ru.speech_mics ?? ru.speechMics),
          monitor_mixes: toInt(ru.monitor_mixes ?? ru.monitorMixes),
          iem_packs: toInt(ru.iem_packs ?? ru.iemPacks),
          di_boxes: toInt(ru.di_boxes ?? ru.diBoxes),
        };
        const backlineRaw: any = tbBacklineRequested || {};
        const backlineRequested: Record<string, number> = {};
        Object.entries(backlineRaw).forEach(([key, val]) => {
          const n = Number(val);
          if (Number.isFinite(n) && n > 0) backlineRequested[key] = n;
        });

        const est = await soundEstimate({
          service_id: Number(svcId),
          guest_count: Number.isFinite(guests) && guests > 0 ? guests : 0,
          venue_type: (venueType === 'outdoor' || venueType === 'hybrid' ? 'outdoor' : 'indoor') as any,
          stage_required: stageRequired,
          stage_size: (stageSize as any) ?? null,
          lighting_evening: lightingEvening,
          upgrade_lighting_advanced: upgradeAdv,
          rider_units: riderUnits,
          backline_requested: backlineRequested,
        });
        const data: any = est?.data || {};
        const baseAmt = Number(data.base || 0);
        const itemsList: any[] = Array.isArray(data.items) ? data.items : [];

        if (items.length === 0 && itemsList.length > 0) {
          const nextExtras: (ServiceItem & { key: string })[] = [];
          for (const it of itemsList) {
            if (!it || typeof it !== 'object') continue;
            if (String(it.key || '') === 'audience_base') continue;
            const label = String(it.label || '').trim() || 'Extra';
            const amt = Number(it.amount ?? it.total ?? 0);
            if (!Number.isFinite(amt) || amt <= 0) continue;
            nextExtras.push({
              key: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              description: label,
              price: amt,
            });
          }
          if (nextExtras.length) {
            setItems(nextExtras);
          }
        }

        if (!dirtyTravel) {
          try {
            const svcDetails: any = br.service?.details || {};
            const travelConf: any = svcDetails.travel || {};
            const perKmRaw = travelConf.per_km_rate ?? travelConf.perKmRate ?? 0;
            const perKm = Number(perKmRaw);
            const baseLoc = String(svcDetails.base_location || '').trim();
            const eventCity = String(tb.event_city || br.event_city || tb.venue_name || '').trim();
            if (perKm > 0 && baseLoc && eventCity) {
              const metrics = await getDrivingMetricsCached(baseLoc, eventCity);
              const distKm = Number(metrics?.distanceKm || 0);
              if (Number.isFinite(distKm) && distKm > 0) {
                const travelPortion = perKm * distKm * 2;
                if (Number.isFinite(travelPortion) && travelPortion > 0) {
                  setTravelFee(travelPortion);
                }
              }
            }
          } catch {
          }
        }

        if (!dirtyService && baseAmt > 0) {
          setServiceFee(baseAmt);
        }

        hasSoundEstimateRef.current = true;
      } catch {
      }
    })();
    return () => {
      active = false;
    };
  }, [bookingRequestId, isSoundService, dirtyTravel, dirtyService, items.length, setItems, setServiceFee, setTravelFee]);
}
