import type { Service } from "@/types";

export interface LiveBookingConfig {
  basePriceZar: number;
  durationMinutes: number;
  soundProvisioning: any;
  travelRate?: number;
  travelMembers?: number;
  serviceId?: number;
}

function toNumber(val: any): number | undefined {
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

export function fromServiceToLiveBookingConfig(
  service?: Service | null,
): LiveBookingConfig {
  const details = (service?.details || {}) as Record<string, any>;
  const durationMinutes =
    toNumber(service?.duration_minutes) ??
    toNumber(details.duration_minutes) ??
    60;
  const soundProvisioning = details.sound_provisioning || {};

  return {
    basePriceZar: toNumber(service?.price) ?? 0,
    durationMinutes,
    soundProvisioning,
    travelRate: toNumber((service as any)?.travel_rate),
    travelMembers: toNumber((service as any)?.travel_members),
    serviceId: service?.id,
  };
}
