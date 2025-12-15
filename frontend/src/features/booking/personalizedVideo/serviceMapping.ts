import type { Service } from "@/types";

export type PvLengthChoice = "30_45" | "60_90";

export interface PvBookingConfig {
  basePriceZar: number;
  addOnLongZar: number;
  defaultLengthChoice: PvLengthChoice;
  supportedLanguages: string[];
  defaultLanguage: string;
  minNoticeDays: number;
  rushCustomEnabled: boolean;
  rushFeeZar: number;
  rushWithinDays: number;
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

  const minNoticeDays = (() => {
    const n = Number(details.min_notice_days ?? 1);
    if (!Number.isFinite(n)) return 1;
    return Math.max(0, Math.min(365, Math.trunc(n)));
  })();

  const rushCustomEnabled = Boolean(details.rush_custom_enabled);
  const rushFeeZar = (() => {
    const n = Number(details.rush_fee_zar ?? 0);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.round(n));
  })();
  const rushWithinDays = (() => {
    const n = Number(details.rush_within_days ?? 2);
    if (!Number.isFinite(n)) return 2;
    return Math.max(0, Math.min(30, Math.trunc(n)));
  })();

  return {
    basePriceZar: base,
    addOnLongZar: addOn,
    defaultLengthChoice,
    supportedLanguages: langs,
    defaultLanguage,
    minNoticeDays,
    rushCustomEnabled,
    rushFeeZar,
    rushWithinDays,
  };
}
