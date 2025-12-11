import type { Service } from "@/types";

export type PvLengthChoice = "30_45" | "60_90";

export interface PvBookingConfig {
  basePriceZar: number;
  addOnLongZar: number;
  defaultLengthChoice: PvLengthChoice;
  supportedLanguages: string[];
  defaultLanguage: string;
}

const DEFAULT_LANGS = ["EN", "AF"] as const;

export function fromServiceToPvBookingConfig(service?: Service | null): PvBookingConfig {
  const details = (service?.details || {}) as Record<string, any>;
  const base = Number(service?.price ?? 0) || 0;
  const addOn = Number(details.long_addon_price ?? 0) || 0;
  const baseLengthSec = Number(details.base_length_sec ?? 40) || 40;
  const defaultLengthChoice: PvLengthChoice = baseLengthSec >= 60 ? "60_90" : "30_45";

  const langs = Array.isArray(details.languages) && details.languages.length > 0
    ? details.languages.map((l: any) => String(l))
    : [...DEFAULT_LANGS];

  const defaultLanguage = langs[0] || DEFAULT_LANGS[0];

  return {
    basePriceZar: base,
    addOnLongZar: addOn,
    defaultLengthChoice,
    supportedLanguages: langs,
    defaultLanguage,
  };
}
