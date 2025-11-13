import type { QuoteV2, QuoteTotalsPreview as QuoteTotalsPreviewPayload } from '@/types';

export interface QuoteTotalsResolved {
  providerSubtotal?: number;
  platformFeeExVat?: number;
  platformFeeVat?: number;
  clientTotalInclVat?: number;
}

export const QUOTE_TOTALS_PLACEHOLDER = '—';

const DEFAULT_CLIENT_FEE_RATE = Number.isFinite(Number(process.env.NEXT_PUBLIC_CLIENT_FEE_RATE))
  ? Number(process.env.NEXT_PUBLIC_CLIENT_FEE_RATE)
  : 0.03;
const DEFAULT_VAT_RATE = Number.isFinite(Number(process.env.NEXT_PUBLIC_VAT_RATE))
  ? Number(process.env.NEXT_PUBLIC_VAT_RATE)
  : 0.15;

const toNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const roundCurrency = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const sanitizeMoney = (value: unknown): number | undefined => {
  const num = toNumber(value);
  if (num === undefined) return undefined;
  return Number.isFinite(num) ? num : undefined;
};

const resolveRate = (value: unknown, fallback: number): number => {
  const parsed = sanitizeMoney(value);
  if (parsed === undefined) return fallback;
  return parsed >= 0 ? parsed : fallback;
};

export function computeQuoteTotalsFromAmounts(params: {
  subtotal?: number | null;
  total?: number | null;
  clientFeeRate?: number;
  vatRate?: number;
}): QuoteTotalsResolved | null {
  const providerSubtotalRaw = sanitizeMoney(params.subtotal);
  const totalRaw = sanitizeMoney(params.total);
  const providerSubtotal = providerSubtotalRaw ?? totalRaw;
  const providerTotal = totalRaw ?? providerSubtotalRaw;
  if (!providerSubtotal || providerSubtotal <= 0 || !providerTotal || providerTotal <= 0) {
    return null;
  }
  const clientFeeRate = resolveRate(params.clientFeeRate, DEFAULT_CLIENT_FEE_RATE);
  const vatRate = resolveRate(params.vatRate, DEFAULT_VAT_RATE);
  const platformFeeExVat = roundCurrency(providerSubtotal * clientFeeRate);
  const platformFeeVat = roundCurrency(platformFeeExVat * vatRate);
  const clientTotalInclVat = roundCurrency(providerTotal + platformFeeExVat + platformFeeVat);
  return {
    providerSubtotal: roundCurrency(providerSubtotal),
    platformFeeExVat,
    platformFeeVat,
    clientTotalInclVat,
  };
}

/**
 * Normalize totals preview data from QuoteV2 responses (nested or legacy fields).
 * All Booka fee + VAT math happens on the backend; this helper simply surfaces
 * the provided values so components can display them or fall back to a placeholder.
 */
export function resolveQuoteTotalsPreview(source?: Partial<QuoteV2> | null): QuoteTotalsResolved {
  const nested = (source as { totals_preview?: QuoteTotalsPreviewPayload | null })?.totals_preview;
  const legacy: any = source ?? {};
  const resolved: QuoteTotalsResolved = {
    providerSubtotal: toNumber(nested?.provider_subtotal ?? legacy?.provider_subtotal_preview),
    platformFeeExVat: toNumber(nested?.platform_fee_ex_vat ?? legacy?.booka_fee_preview),
    platformFeeVat: toNumber(nested?.platform_fee_vat ?? legacy?.booka_fee_vat_preview),
    clientTotalInclVat: toNumber(nested?.client_total_incl_vat ?? legacy?.client_total_preview),
  };
  const hasAllPreview =
    typeof resolved.providerSubtotal === 'number' &&
    typeof resolved.platformFeeExVat === 'number' &&
    typeof resolved.platformFeeVat === 'number' &&
    typeof resolved.clientTotalInclVat === 'number';
  if (!hasAllPreview) {
    // Derive sensible subtotal/total when missing using services + fees
    const services = Array.isArray((source as any)?.services)
      ? ((source as any)?.services as Array<{ price?: number | string }>)
      : [];
    const baseFromServices = services.reduce<number>((sum, s) => {
      const p = toNumber(s?.price);
      return sum + (typeof p === 'number' ? p : 0);
    }, 0);
    const soundFee = toNumber((source as any)?.sound_fee) ?? 0;
    const travelFee = toNumber((source as any)?.travel_fee) ?? 0;
    const discount = toNumber((source as any)?.discount) ?? 0;

    const derivedSubtotal = (() => {
      const s = toNumber((source as any)?.subtotal);
      if (typeof s === 'number' && s > 0) return s;
      const calc = baseFromServices + soundFee + travelFee - discount;
      return calc > 0 ? calc : undefined;
    })();

    const derivedTotal = (() => {
      const t = toNumber((source as any)?.total ?? legacy?.amount ?? legacy?.price);
      if (typeof t === 'number' && t > 0) return t;
      // If total missing, fall back to subtotal; backend may not split VAT for legacy rows
      return derivedSubtotal;
    })();

    const fallback = computeQuoteTotalsFromAmounts({ subtotal: derivedSubtotal, total: derivedTotal });
    if (fallback) {
      resolved.providerSubtotal ??= fallback.providerSubtotal;
      resolved.platformFeeExVat ??= fallback.platformFeeExVat;
      resolved.platformFeeVat ??= fallback.platformFeeVat;
      resolved.clientTotalInclVat ??= fallback.clientTotalInclVat;
    }
  }
  return resolved;
}

export const hasClientTotalPreview = (preview: QuoteTotalsResolved | undefined): boolean =>
  typeof preview?.clientTotalInclVat === 'number' && Number.isFinite(preview.clientTotalInclVat);
