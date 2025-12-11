import type { Service } from "@/types";

export interface CustomSongBookingConfig {
  basePriceZar: number;
  baseLengthSec: number;
  deliveryFormat: string;
  includesMaster: boolean;
}

function toNumber(val: any, fallback: number): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

export function fromServiceToCustomSongBookingConfig(
  service?: Service | null,
): CustomSongBookingConfig {
  const details = (service?.details || {}) as Record<string, any>;
  const baseLengthSec = toNumber(details.base_length_sec, 60);
  const deliveryFormat =
    typeof details.delivery_format === "string" && details.delivery_format.trim()
      ? details.delivery_format.trim()
      : "mp3";
  const includesMaster = Boolean(details.includes_master);

  return {
    basePriceZar: toNumber(service?.price, 0),
    baseLengthSec,
    deliveryFormat,
    includesMaster,
  };
}
