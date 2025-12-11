import { estimatePriceSafe, calculateSoundServiceEstimate } from "@/lib/api";
import { computeSoundServicePrice } from "@/lib/soundPricing";

type SoundFallbackStageSize = "S" | "M" | "L";

export interface SoundFallbackParams {
  serviceId: number;
  supplierServiceId?: number | null;
  supplierService?: any | null;
  eventCity?: string | null;
  guestCount?: number | null;
  venueType?: string | null;
  stageRequired?: boolean;
  stageSize?: SoundFallbackStageSize;
  lightingEvening?: boolean;
  lightingUpgradeAdvanced?: boolean;
  backlineRequired?: boolean;
  riderUnits?: Record<string, number> | undefined;
  backlineRequested?: Record<string, number> | undefined;
  distanceKm?: number | null;
}

export interface SoundFallbackDeps {
  loadService?: (serviceId: number) => Promise<any | null>;
  pricebookEstimate?: typeof estimatePriceSafe;
  calculateEstimate?: typeof calculateSoundServiceEstimate;
  log?: (event: string, data?: any) => void;
}

const toNumber = (val: unknown): number => {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Replicates the legacy BookingWizard sound fallback behaviour:
 * 1) Pricebook audience tiers (estimatePriceSafe)
 * 2) Supplier estimate (calculateSoundServiceEstimate)
 * 3) Local audience/backline computation (computeSoundServicePrice)
 */
export async function computeFallbackSoundCost(
  params: SoundFallbackParams,
  deps?: SoundFallbackDeps,
): Promise<number | null> {
  const supplierServiceId = params.supplierServiceId;
  if (!supplierServiceId) return null;

  const log = deps?.log;
  const pricebookEstimate = deps?.pricebookEstimate ?? estimatePriceSafe;
  const calculateEstimate = deps?.calculateEstimate ?? calculateSoundServiceEstimate;
  const loadService = deps?.loadService;

  const guestCount =
    params.guestCount != null && Number.isFinite(params.guestCount)
      ? Number(params.guestCount)
      : undefined;
  const stageSize = params.stageRequired ? params.stageSize || "S" : null;

  // 1) Pricebook audience tiers
  try {
    const pb = await pricebookEstimate(supplierServiceId, {
      rider_spec: {
        monitors: params.riderUnits?.monitor_mixes || 0,
        wireless: params.riderUnits?.speech_mics || 0,
        di: params.riderUnits?.di_boxes || 0,
        vocal_mics: params.riderUnits?.vocal_mics || 0,
        iem_packs: params.riderUnits?.iem_packs || 0,
      },
      event_city: params.eventCity || undefined,
      distance_km: params.distanceKm ?? undefined,
      managed_by_artist: false,
      artist_managed_markup_percent: 0,
      guest_count: guestCount,
      backline_required: !!params.backlineRequired,
      lighting_evening: !!params.lightingEvening,
      outdoor: (params.venueType || "").toLowerCase() === "outdoor",
      stage_size: stageSize,
    });
    const min = toNumber(pb?.estimate_min);
    const max = toNumber(pb?.estimate_max);
    if (Number.isFinite(min) && Number.isFinite(max) && max > 0) {
      return (min + max) / 2;
    }
  } catch (e) {
    log?.("sound.fallback.pricebook.error", e);
  }

  // 2) Supplier estimate endpoint
  try {
    const svcEstimate = await calculateEstimate(supplierServiceId, {
      guest_count: guestCount || 0,
      venue_type: (params.venueType as any) || "indoor",
      stage_required: !!params.stageRequired,
      stage_size: stageSize,
      lighting_evening: !!params.lightingEvening,
      upgrade_lighting_advanced: !!params.lightingUpgradeAdvanced,
      rider_units: params.riderUnits,
      backline_requested: params.backlineRequested,
      backline_required: !!params.backlineRequired,
      event_city: params.eventCity || undefined,
      distance_km: params.distanceKm ?? undefined,
    });
    const t = toNumber((svcEstimate as any)?.total);
    if (Number.isFinite(t) && t > 0) {
      return t;
    }
  } catch (e) {
    log?.("sound.fallback.estimate.error", e);
  }

  // 3) Local compute using supplier service details
  try {
    const svc = params.supplierService || (loadService ? await loadService(supplierServiceId) : null);
    if (svc?.details) {
      const res = computeSoundServicePrice({
        details: svc.details,
        guestCount,
        venueType: (params.venueType as any) || undefined,
        stageRequired: !!params.stageRequired,
        stageSize: stageSize || undefined,
        lightingEvening: !!params.lightingEvening,
        upgradeLightingAdvanced: !!params.lightingUpgradeAdvanced,
        riderUnits: params.riderUnits,
        backlineRequested: params.backlineRequested,
      });
      const t = toNumber(res?.total);
      if (Number.isFinite(t) && t > 0) {
        return t;
      }
    }
  } catch (e) {
    log?.("sound.fallback.local.error", e);
  }

  return null;
}
